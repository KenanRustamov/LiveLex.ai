from PIL import Image
import os

def create_icon(source_path, size, output_path):
    print(f"Processing {size}x{size} icon...")
    try:
        img = Image.open(source_path).convert("RGBA")
        
        # Create white background
        bg = Image.new("RGBA", (size, size), "WHITE")
        
        # Resize image to fit keeping aspect ratio, with some padding
        # Target size is slightly smaller than full icon size for padding
        target_size = int(size * 0.8)
        img.thumbnail((target_size, target_size), Image.Resampling.LANCZOS)
        
        # Center the image
        pos_x = (size - img.width) // 2
        pos_y = (size - img.height) // 2
        
        # Paste image onto background (using image itself as mask for transparency)
        bg.paste(img, (pos_x, pos_y), img)
        
        # Save as PNG (remove alpha channel since we want opaque white)
        bg.convert("RGB").save(output_path, "PNG")
        print(f"Saved {output_path}")
    except Exception as e:
        print(f"Error processing {output_path}: {e}")

source = "apps/frontend/public/logo_only.png"
if os.path.exists(source):
    create_icon(source, 192, "apps/frontend/public/icon-192.png")
    create_icon(source, 512, "apps/frontend/public/icon-512.png")
else:
    print(f"Source file not found: {source}")
