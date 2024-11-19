import os
import glob
import boto3
import logging
from nanoid import generate
import argparse
from botocore.exceptions import ClientError
from PIL import Image

# Command-line arguments
parser = argparse.ArgumentParser()
parser.add_argument("-image_directory", help="Directory with image files to use", default="../assets/animations/ice1")
parser.add_argument("-sprite_size", help="Size of each sprite in pixels", default=64)

# python spritePacker.py -image_directory ../app/public/animations/smoke
# python spritePacker.py -image_directory ../app/public/animations/rising_smoke
# python spritePacker.py -image_directory ../app/public/animations/hit
# python spritePacker.py -image_directory ../app/public/animations/explosion
# python spritePacker.py -image_directory ../app/public/animations/fire
# python spritePacker.py -image_directory ../app/public/animations/heal

if __name__ == '__main__':

    # Get arguments
    args = parser.parse_args()

    # Read the map image
    imagepaths = sorted(glob.glob(os.path.join(args.image_directory, "*.png")))
    images = [Image.open(file) for file in imagepaths]

    # Get the widest image
    width, height= max([image.size for image in images])
    ratio = width / args.sprite_size if width > height else height / args.sprite_size
    
    # Resize all images based on this ratio
    scaled = []
    for image in images:
        resized = image.resize((int(image.size[0]/ratio), int(image.size[1]/ratio)))
        scaled_image = Image.new('RGBA', (args.sprite_size, args.sprite_size))
        scaled_image.paste(resized, (int((args.sprite_size - resized.size[0]) / 2), int((args.sprite_size - resized.size[1]) / 2)))
        scaled.append(scaled_image)

    # Create a new image and add all other images
    new_image = Image.new('RGBA', (args.sprite_size, args.sprite_size*len(images)))

    # Paste in sprites
    for i, image in enumerate(scaled):
        new_image.paste(image, (0, i*args.sprite_size))

    # Output files
    basename = os.path.basename(args.image_directory)
    png_path = os.path.join(args.image_directory, '..', basename + '.png')

    # Save image to original directory
    new_image.save(png_path)

    # Convert to .webp
    webp_path = png_path.replace('.png', '.webp')
    os.system(f"convert {png_path} -coalesce -quality 50 -resize 128x -define webp:lossless=false,method=6 {webp_path} && rm -rf {png_path}")

    # Upload the file to S3
    s3_client = boto3.client('s3')
    try:
        response = s3_client.upload_file(webp_path, "theninja-user-uploads", basename + ".webp")        
    except ClientError as e:
        logging.error(e)

    # Once uploaded, add the required SQL entry to .sql file
    s3_location = f"https://theninja-user-uploads.s3.us-west-2.amazonaws.com/{basename}.webp"

    with open("spritePacker.sql", "a") as f:
        print("Adding: ", basename)
        f.write(f"\nINSERT INTO GameAsset (id, name, type, image, frames, speed, licenseDetails, createdByUserId) VALUES ('{generate()}', '{basename}', 'ANIMATION', '{s3_location}', '{len(images)}', '50', 'TNR', '1');");

    # Save gif file as well
    #gif_path = os.path.join(args.image_directory, '..', basename + '.gif')
    #empty_start = Image.new('RGBA', (args.sprite_size, args.sprite_size))
    #empty_start.save(gif_path, save_all=True, append_images=scaled, duration=100, loop=0)
