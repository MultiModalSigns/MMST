# this file contains functions used from the main.py file

import base64
import os
import cv2
import shutil
import numpy as np


# this function creates the url of the GET request given the parameters and the url
def build_url(base_url, params):
    # Construct the full URL with parameters
    return f"{base_url}?{'&'.join([f'{key}={value}' for key, value in params.items()])}"


# this function returns a base64 encoding of the given file video
def encode_video_to_base64(file_path):
    with open(file_path, "rb") as video_file:
        video_data = video_file.read()
        base64_encoded_data = base64.b64encode(video_data)
        base64_message = base64_encoded_data.decode("utf-8")
        return base64_message


# this function removes a file from the file system
def deleteFile(file_path):
    if os.path.exists(file_path):
        os.remove(file_path)


def deleteFolder(path):
    if os.path.exists(path):
        shutil.rmtree(path)


# check if the string given as input is base64 encoded
def isBase64(input):
    try:
        return base64.b64encode(base64.b64decode(input)) == input
    except Exception:
        return False


def base64_to_audio(base64_audio, output_file_path):
    # Decode the base64 string
    audio_data = base64.b64decode(base64_audio)
    # Write the binary data to a file
    with open(output_file_path, "wb") as audio_file:
        audio_file.write(audio_data)


def extract_frames_from_folder(output_folder):
    images = []
    for filename in os.listdir(output_folder):
        if filename.endswith(".jpg"):
            with open(os.path.join(output_folder, filename), "rb") as image_file:
                image_data = image_file.read()
                images.append(
                    f"data:image/jpeg;base64,{base64.b64encode(image_data).decode('utf-8')}"
            )
    return images


def extract_frames_best_performing(video_path, output_folder, interval=0.2, sharpness_threshold=100):
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)

    # Open the video
    vidcap = cv2.VideoCapture(video_path)
    if not vidcap.isOpened():
        print("Error: Could not open video.")
        return

    fps = vidcap.get(cv2.CAP_PROP_FPS)  # Get the FPS value from the video
    total_frames = int(vidcap.get(cv2.CAP_PROP_FRAME_COUNT))
    if fps == 0:
        print("Error: FPS value is 0.")
        return

    frame_interval = int(fps * interval)  # Calculate frame interval for extraction
    print(f"FPS: {fps}, Frame Interval: {frame_interval}, Total Frames: {total_frames}")

    frame_count = 0
    success = True
    while success and frame_count < total_frames:
        success, image = vidcap.read()
        if not success:
            print(f"Error: Failed to read frame at count {frame_count}.")
            break

        if frame_count % frame_interval == 0:
            # Calculate the sharpness of the frame
            gray_image = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            laplacian_var = cv2.Laplacian(gray_image, cv2.CV_64F).var()
            print(f"Frame {frame_count}: Laplacian Variance = {laplacian_var}")

            if laplacian_var > sharpness_threshold:
                frame_path = os.path.join(output_folder, f"frame{frame_count:04d}.jpg")
                cv2.imwrite(frame_path, image)  # Save the frame as a JPG file
                print(
                    f"Saved frame at count {frame_count} with sharpness {laplacian_var}"
                )

        frame_count += 1

    vidcap.release()
    print("Video processing complete.")


# Funzione per estrarre i frame
def extract_frames_low(video_path, output_folder, interval=0.5):
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)

    # Aprire il video
    vidcap = cv2.VideoCapture(video_path)
    fps = vidcap.get(cv2.CAP_PROP_FPS)  # Frame per second
    frame_interval = int(fps * interval)  # Intervallo di frame per l'estrazione

    frame_count = 0
    success = True
    while success:
        success, image = vidcap.read()
        if frame_count % frame_interval == 0 and success:
            frame_path = os.path.join(output_folder, f"frame{frame_count:04d}.jpg")
            cv2.imwrite(frame_path, image)  # Salva il frame come file JPG
        frame_count += 1

    vidcap.release()
