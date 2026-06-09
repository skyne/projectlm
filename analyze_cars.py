from PIL import Image, ImageFilter
import numpy as np
import os

BASE = "/mnt/data/Projects/projectlm/viewer/public/assets/livery/hypercar"

CARS = [
    "bmw-m-hybrid-v8",
    "cadillac-v-series-r",
    "ferrari-499p",
    "lamborghini-sc63",
    "lmh-generic",
    "peugeot-9x8",
    "porsche-963",
    "toyota-gr010",
]

def find_circular_features(binary, min_radius=5, max_radius=30):
    """Look for wheel arches by scanning bottom edge for U-shape gaps."""
    h, w = binary.shape
    
    # For each column, find the lowest pixel
    col_bottom = np.full(w, -1)
    for x in range(w):
        ys = np.where(binary[:, x] > 0)[0]
        if len(ys) > 0:
            col_bottom[x] = ys[-1]
    
    # Find gaps where bottom drops (wheel arches)
    circles = []
    in_gap = False
    gap_start = 0
    for x in range(1, w):
        if col_bottom[x] < 0 and col_bottom[x-1] >= 0:
            if not in_gap:
                gap_start = x
                in_gap = True
        elif col_bottom[x] >= 0 and col_bottom[x-1] < 0 and in_gap:
            gap_end = x - 1
            gap_center = (gap_start + gap_end) // 2
            gap_width = gap_end - gap_start
            if 5 < gap_width < 80:
                left_y = col_bottom[max(0, gap_start - 2)]
                right_y = col_bottom[min(w - 1, gap_end + 2)]
                if left_y >= 0 and right_y >= 0:
                    y_at_gap = int((left_y + right_y) / 2)
                else:
                    y_at_gap = h - 1
                circles.append((gap_center, y_at_gap, gap_width // 2))
            in_gap = False
    
    if not circles:
        # Fallback: simple connected components in lower half using flood fill
        lower_half = binary[h//2:, :].copy()
        lh, lw = lower_half.shape
        next_label = 1
        label_map = np.zeros_like(lower_half, dtype=np.int32)
        
        def flood_fill(sy, sx, label_id):
            stack = [(sy, sx)]
            while stack:
                y, x = stack.pop()
                if y < 0 or y >= lh or x < 0 or x >= lw:
                    continue
                if lower_half[y, x] == 0 or label_map[y, x] != 0:
                    continue
                label_map[y, x] = label_id
                stack.extend([(y-1, x), (y+1, x), (y, x-1), (y, x+1)])
        
        for y in range(lh):
            for x in range(lw):
                if lower_half[y, x] > 0 and label_map[y, x] == 0:
                    flood_fill(y, x, next_label)
                    next_label += 1
        
        for feat_id in range(1, next_label):
            ys, xs = np.where(label_map == feat_id)
            if 10 < len(ys) < 200:
                cx = int(np.mean(xs))
                cy = int(np.mean(ys)) + h // 2
                radius = int((np.max(ys) - np.min(ys) + np.max(xs) - np.min(xs)) / 4)
                circles.append((cx, cy, radius))
    
    return circles

def find_cockpit_window(binary):
    """Look for window-like features in upper-middle portion."""
    h, w = binary.shape
    # Windows typically in upper 25-55% of image, middle 60% horizontally
    y_start = int(h * 0.15)
    y_end = int(h * 0.55)
    x_start = int(w * 0.15)
    x_end = int(w * 0.85)
    
    region = binary[y_start:y_end, x_start:x_end]
    if np.sum(region) == 0:
        return None
    
    # Look for horizontal line-like structures (windshield/roof lines)
    # Scan rows from top, find first row with significant pixels
    row_sums = np.sum(region, axis=1)
    significant_rows = np.where(row_sums > np.max(row_sums) * 0.2)[0]
    
    if len(significant_rows) < 3:
        return None
    
    # The window area is typically between the first and last significant rows
    top_row = significant_rows[0] + y_start
    bottom_row = significant_rows[-1] + y_start
    
    # Find leftmost and rightmost pixels in this region
    cols_with_pixels = np.where(np.sum(binary[top_row:bottom_row+1, :], axis=0) > 0)[0]
    if len(cols_with_pixels) == 0:
        return None
    
    left_col = cols_with_pixels[0]
    right_col = cols_with_pixels[-1]
    
    # Estimate center
    center_x = (left_col + right_col) // 2
    center_y = (top_row + bottom_row) // 2
    
    return {
        "x_range": (left_col, right_col),
        "y_range": (top_row, bottom_row),
        "center": (center_x, center_y),
        "width": right_col - left_col,
        "height": bottom_row - top_row,
    }

def label_components(binary):
    """Simple connected component labeling (4-connected)."""
    h, w = binary.shape
    label_map = np.zeros_like(binary, dtype=np.int32)
    next_label = 1
    
    def flood(y, x, label_id):
        stack = [(y, x)]
        while stack:
            cy, cx = stack.pop()
            if cy < 0 or cy >= h or cx < 0 or cx >= w:
                continue
            if binary[cy, cx] == 0 or label_map[cy, cx] != 0:
                continue
            label_map[cy, cx] = label_id
            stack.extend([(cy-1, cx), (cy+1, cx), (cy, cx-1), (cy, cx+1)])
    
    for y in range(h):
        for x in range(w):
            if binary[y, x] > 0 and label_map[y, x] == 0:
                flood(y, x, next_label)
                next_label += 1
    
    return label_map, next_label - 1

def find_headlights(binary):
    """Look for small bright/shape features near front of car."""
    h, w = binary.shape
    cols = np.where(np.sum(binary, axis=0) > 0)[0]
    if len(cols) < 10:
        return []
    
    leftmost = cols[0]
    rightmost = cols[-1]
    front_edge_size = max(20, int(w * 0.08))
    
    headlights = []
    
    # Check front (left side) - look in a vertical strip near left edge
    left_region = binary[:, :front_edge_size]
    if np.sum(left_region) > 10:
        ys, xs = np.where(left_region > 0)
        cx = int(np.mean(xs))
        cy = int(np.mean(ys))
        headlights.append({"side": "front/left", "approx_pos": (cx, cy), "pixels": len(ys)})
    
    # Check rear (right side) - look in vertical strip near right edge
    right_region = binary[:, -front_edge_size:]
    if np.sum(right_region) > 10:
        ys, xs = np.where(right_region > 0)
        cx = int(np.mean(xs)) + w - front_edge_size
        cy = int(np.mean(ys))
        headlights.append({"side": "rear/right", "approx_pos": (cx, cy), "pixels": len(ys)})
    
    # Also try to find smaller distinct clusters near the edges
    for edge_name, x_start, x_end in [
        ("front", 0, front_edge_size),
        ("rear", w - front_edge_size, w),
    ]:
        strip = binary[:, x_start:x_end]
        if np.sum(strip) < 5:
            continue
        labeled, n_feat = label_components(strip)
        if n_feat >= 2:
            for feat_id in range(1, n_feat + 1):
                feat_ys, feat_xs = np.where(labeled == feat_id)
                if len(feat_ys) >= 3:
                    cx = int(np.mean(feat_xs)) + x_start
                    cy = int(np.mean(feat_ys))
                    headlights.append({"side": f"{edge_name}_cluster", "approx_pos": (cx, cy), "pixels": len(feat_ys)})
    
    return headlights

def analyze_outline(filepath):
    img = Image.open(filepath).convert("RGBA")
    arr = np.array(img)
    h, w = arr.shape[:2]
    
    # Binary: any non-transparent pixel
    alpha = arr[:, :, 3]
    binary = (alpha > 0).astype(np.uint8)
    total_pixels = np.sum(binary)
    
    print(f"  Dimensions: {w} x {h}")
    print(f"  Total opaque pixels: {total_pixels}")
    
    # Row-by-row shape description
    col_mid = w // 2
    row_sums = np.sum(binary, axis=1)
    nonempty_rows = np.where(row_sums > 0)[0]
    
    print(f"  Vertical span: rows {nonempty_rows[0]}-{nonempty_rows[-1]} ({(nonempty_rows[-1]-nonempty_rows[0]+1)} rows)")
    
    # Find key shape sections
    top_quarter = nonempty_rows[0] + (nonempty_rows[-1] - nonempty_rows[0]) // 4
    mid_point = nonempty_rows[0] + (nonempty_rows[-1] - nonempty_rows[0]) // 2
    bottom_quarter = nonempty_rows[-1] - (nonempty_rows[-1] - nonempty_rows[0]) // 4
    
    # Top section (nose/cockpit)
    top_rows = binary[nonempty_rows[0]:top_quarter+1, :]
    top_cols = np.where(np.sum(top_rows, axis=0) > 0)[0]
    print(f"  Top section (rows {nonempty_rows[0]}-{top_quarter}): width ~{top_cols[-1]-top_cols[0]+1}px (cols {top_cols[0]}-{top_cols[-1]})")
    
    # Middle section (main body)
    mid_rows = binary[top_quarter+1:bottom_quarter, :]
    mid_cols = np.where(np.sum(mid_rows, axis=0) > 0)[0]
    if len(mid_cols) > 0:
        print(f"  Middle section (rows {top_quarter+1}-{bottom_quarter}): width ~{mid_cols[-1]-mid_cols[0]+1}px (cols {mid_cols[0]}-{mid_cols[-1]})")
    
    # Bottom section (wheels/diffuser)
    bot_rows = binary[bottom_quarter:nonempty_rows[-1]+1, :]
    bot_cols = np.where(np.sum(bot_rows, axis=0) > 0)[0]
    if len(bot_cols) > 0:
        print(f"  Bottom section (rows {bottom_quarter}-{nonempty_rows[-1]}): width ~{bot_cols[-1]-bot_cols[0]+1}px")
    
    # Wheel detection
    wheels = find_circular_features(binary)
    print(f"  Detected wheel-like features: {len(wheels)}")
    for i, (wx, wy, wr) in enumerate(wheels):
        print(f"    Wheel {i+1}: approx center ({wx}, {wy}), radius ~{wr}px")
    
    # Cockpit window
    cockpit = find_cockpit_window(binary)
    if cockpit:
        print(f"  Cockpit/window region: x={cockpit['x_range']}, y={cockpit['y_range']}, "
              f"center={cockpit['center']}, size={cockpit['width']}x{cockpit['height']}")
    else:
        print(f"  Cockpit/window: not clearly detected")
    
    # Scan for horizontal lines in upper portion (windshield)
    upper = binary[:mid_point, :]
    h_line_count = 0
    for y in range(upper.shape[0]):
        run = np.where(upper[y, :] > 0)[0]
        if len(run) > w * 0.3:
            h_line_count += 1
    if h_line_count > 2:
        print(f"  Windshield/roof area: ~{h_line_count} horizontal rows with significant pixels in upper half")
    
    # Headlights
    headlights = find_headlights(binary)
    print(f"  Detected headlight/rearlight features: {len(headlights)}")
    for hl in headlights:
        print(f"    {hl['side']}: ~{hl['approx_pos']}, ~{hl['pixels']} pixels")
    
    return {
        "dimensions": (w, h),
        "total_pixels": total_pixels,
        "wheels": wheels,
        "cockpit": cockpit,
        "headlights": headlights,
    }

def analyze_details(filepath):
    img = Image.open(filepath).convert("RGBA")
    arr = np.array(img)
    h, w = arr.shape[:2]
    
    r_pixels = np.sum((arr[:, :, 0] > 0) & (arr[:, :, 3] > 0))
    g_pixels = np.sum((arr[:, :, 1] > 0) & (arr[:, :, 3] > 0))
    b_pixels = np.sum((arr[:, :, 2] > 0) & (arr[:, :, 3] > 0))
    transparent = np.sum(arr[:, :, 3] == 0)
    
    # Count by dominant channel
    r_dominant = np.sum((arr[:, :, 0] > arr[:, :, 1]) & (arr[:, :, 0] > arr[:, :, 2]) & (arr[:, :, 3] > 0))
    g_dominant = np.sum((arr[:, :, 1] > arr[:, :, 0]) & (arr[:, :, 1] > arr[:, :, 2]) & (arr[:, :, 3] > 0))
    b_dominant = np.sum((arr[:, :, 2] > arr[:, :, 0]) & (arr[:, :, 2] > arr[:, :, 1]) & (arr[:, :, 3] > 0))
    other_visible = np.sum(arr[:, :, 3] > 0) - r_dominant - g_dominant - b_dominant
    
    print(f"  Dimensions: {w} x {h}")
    print(f"  Red-dominant pixels (any red>0): {r_dominant} (total with any red: {r_pixels})")
    print(f"  Green-dominant pixels (any green>0): {g_dominant} (total with any green: {g_pixels})")
    print(f"  Blue-dominant pixels (any blue>0): {b_dominant} (total with any blue: {b_pixels})")
    print(f"  Other visible (ties/grays): {other_visible}")
    print(f"  Transparent pixels: {transparent}")
    
    return {
        "dimensions": (w, h),
        "red": r_dominant,
        "green": g_dominant,
        "blue": b_dominant,
        "other": other_visible,
        "transparent": transparent,
        "any_red": r_pixels,
        "any_green": g_pixels,
        "any_blue": b_pixels,
    }

for car in CARS:
    outline_path = os.path.join(BASE, f"{car}-outline.png")
    details_path = os.path.join(BASE, f"{car}-details.png")
    mask_path = os.path.join(BASE, f"{car}-mask.png")
    
    print(f"\n{'='*70}")
    print(f"=== {car.upper()}")
    print(f"{'='*70}")
    
    # Check all three files exist
    for p, label in [(outline_path, "outline"), (details_path, "details"), (mask_path, "mask")]:
        if not os.path.exists(p):
            print(f"  WARNING: {label} not found at {p}")
    
    # Compare dimensions
    dims = {}
    for p, label in [(outline_path, "outline"), (details_path, "details"), (mask_path, "mask")]:
        if os.path.exists(p):
            with Image.open(p) as img:
                dims[label] = img.size
                print(f"  {label}: {img.size[0]}x{img.size[1]}")
    
    if len(set(dims.values())) == 1:
        print(f"  ✓ All files match at {list(dims.values())[0]}")
    else:
        print(f"  ✗ MISMATCH: {dims}")
    
    print()
    print("  --- Outline Analysis ---")
    outline_data = analyze_outline(outline_path)
    
    print()
    print("  --- Details Analysis ---")
    details_data = analyze_details(details_path)

print(f"\n{'='*70}")
print("=== SUMMARY TABLE")
print(f"{'='*70}")
print(f"{'Car':35s} {'Dims':12s} {'Outline Px':12s} {'Red':8s} {'Green':8s} {'Blue':8s} {'Transp':8s} {'Match':6s}")
print(f"{'-'*35} {'-'*12} {'-'*12} {'-'*8} {'-'*8} {'-'*8} {'-'*8} {'-'*6}")

for car in CARS:
    outline_path = os.path.join(BASE, f"{car}-outline.png")
    details_path = os.path.join(BASE, f"{car}-details.png")
    mask_path = os.path.join(BASE, f"{car}-mask.png")
    
    dims_set = set()
    outline_px = 0
    r = g = b = t = 0
    
    for p, label in [(outline_path, "outline"), (details_path, "details"), (mask_path, "mask")]:
        if os.path.exists(p):
            with Image.open(p) as img:
                dims_set.add(img.size)
    
    # Outline
    with Image.open(outline_path) as img:
        arr = np.array(img.convert("RGBA"))
        outline_px = np.sum(arr[:,:,3] > 0)
        w, h = img.size
    
    # Details
    with Image.open(details_path) as img:
        arr = np.array(img.convert("RGBA"))
        r = np.sum((arr[:,:,0] > arr[:,:,1]) & (arr[:,:,0] > arr[:,:,2]) & (arr[:,:,3] > 0))
        g = np.sum((arr[:,:,1] > arr[:,:,0]) & (arr[:,:,1] > arr[:,:,2]) & (arr[:,:,3] > 0))
        b = np.sum((arr[:,:,2] > arr[:,:,0]) & (arr[:,:,2] > arr[:,:,1]) & (arr[:,:,3] > 0))
        t = np.sum(arr[:,:,3] == 0)
    
    match = "✓" if len(dims_set) == 1 else "✗"
    
    print(f"{car:35s} {w:>4}x{str(h):5s} {outline_px:>8d}     {r:>5d}  {g:>5d}  {b:>5d}  {t:>5d}  {match:5s}")
