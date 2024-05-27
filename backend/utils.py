#this file contains functions used from the main.py file

import base64 
import os

# this function creates the url of the GET request given the parameters and the url
def build_url(base_url, params):
    # Construct the full URL with parameters
    return f"{base_url}?{'&'.join([f'{key}={value}' for key, value in params.items()])}"

#this function returns a base64 encoding of the given file video
def encode_video_to_base64(file_path):
    with open(file_path, 'rb') as video_file:
        video_data = video_file.read()
        base64_encoded_data = base64.b64encode(video_data)
        base64_message = base64_encoded_data.decode('utf-8')
        return base64_message

#this function removes a file from the file system
def deleteFile(file_path):
    if os.path.exists(file_path):
        os.remove(file_path)        
   