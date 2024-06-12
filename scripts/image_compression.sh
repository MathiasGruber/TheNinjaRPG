# To convert a set of webp images to a smaller size and quality
for f in *.webp ; convert "$f" -coalesce -quality 50 -resize 512x -define webp:lossless=false,method=6 "compressed/${f%}" ;