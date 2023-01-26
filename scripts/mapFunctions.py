import json
import argparse
import numpy as np
from PIL import Image

# Command-line arguments
parser = argparse.ArgumentParser()
parser.add_argument("-map_image", help="Image to use for creating map", default="data/map.png")
parser.add_argument("-map_data", help="Hexasphere json file", default="data/hexasphere.json")
parser.add_argument("-output_data", help="Output hexasphere json file", default="../app/public/map/hexasphere.json")


if __name__ == '__main__':

    # Get arguments
    args = parser.parse_args()  

    # Read the map image
    map_image = Image.open(args.map_image)

    # Read the map data
    with open(args.map_data) as map_json:
        map_data = json.load(map_json)

    # Get data from the map
    rad = 180 / np.pi
    radius = map_data['radius']
    tiles = map_data['tiles']

    # Get the size of the map image
    width, height = map_image.size

    # Go through each tile
    longs, lats = [], []
    for tile in tiles:

        # Get the tile's center point
        x, y, z = tile['centerPoint']['x'], tile['centerPoint']['y'], tile['centerPoint']['z']

        # Calculate the longitude and latitude of the tile based on the radius   
        longs.append(np.arctan2(y, x) * rad)
        lats.append(np.arcsin(z / radius) * rad)

    # Scale from longs from 0 to width and lats from 0 to height
    longs = ((np.array(longs) + 180) / 360 * width).astype(int) - 1
    lats = ((np.array(lats) + 90) / 180 * height).astype(int) - 1

    # Create new hexasphere json, including information on whether its land, water or dessert
    new_tiles = []
    for tile, long, lat in zip(tiles, longs, lats):
        color = map_image.getpixel((long, lat))
        # 0=water, 1=land, 2=dessert
        if color[0] > color[1]-40:
            color=2
        elif color[1] > color[2]:
            color=1
        else:
            color=0

        new_tiles.append({
            'c': tile['centerPoint'], 
            'b': tile['boundary'], 
            'centerPoint': tile['centerPoint'], 
            't': color
        })

    # Save the new hexasphere json
    with open(args.output_data, 'w') as outfile:
        json.dump({'radius': radius, 'tiles': new_tiles}, outfile)
