import os
import glob
import argparse
from PIL import Image

# Command-line arguments
parser = argparse.ArgumentParser()
parser.add_argument("-image_directory", help="Directory with image files to use", default="../app/tnr/public/animations/smoke")
parser.add_argument("-sprite_size", help="Size of each sprite in pixels", default=128)

# python spritePacker.py -image_directory ../app/tnr/public/animations/smoke
# python spritePacker.py -image_directory ../app/tnr/public/animations/hit
# python spritePacker.py -image_directory ../app/tnr/public/animations/explosion
# python spritePacker.py -image_directory ../app/tnr/public/animations/fire
# python spritePacker.py -image_directory ../app/tnr/public/animations/heal

if __name__ == '__main__':

    # Get arguments
    args = parser.parse_args()  

    # Read the map image
    imagepaths = glob.glob(os.path.join(args.image_directory, "*.png"))
    images = [Image.open(file) for file in imagepaths]

    # Get the widest image
    width, height= max([image.size for image in images])
    ratio = width / args.sprite_size if width > height else height / args.sprite_size
    
    # Resize all images based on this ratio
    scaled = []
    for image in images:        
        resized = image.resize((int(image.size[0]/ratio), int(image.size[1]/ratio)))
        scaled.append(resized)

    # Create a new image and add all other images
    new_image = Image.new('RGBA', (args.sprite_size, args.sprite_size*len(images)))

    # Paste in sprites
    for i, image in enumerate(scaled):
        x = int((args.sprite_size - image.size[0]) / 2)
        y = i*args.sprite_size + int((args.sprite_size - image.size[1]) / 2)
        new_image.paste(image, (x, y))

    # Save image to original directory
    new_image.save(os.path.join(args.image_directory, '..', os.path.basename(args.image_directory) + '.png'))
