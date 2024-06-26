# this file contains all the possible http request developed. Visit localhost:8000/docs to see an overview of the available REST API.

from fastapi import FastAPI, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, validator, constr
import deepl
import whisper
import os
import utils
import requests
import audio2numpy as a2n
from openai import OpenAI
import base64
import random
import soundfile as sf
import io
from datetime import datetime
from pose_format import Pose
from pose_format.pose_visualizer import PoseVisualizer
from dotenv import load_dotenv, dotenv_values
import json

# loading variables from .env file
load_dotenv()
print(os.getenv("DEEPL_API_KEY"))
# import constants file
import constants

app = FastAPI()

# CORS configuration. Allow requests from all the origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Object tha represents a TextToSign request.
class TextToSign(BaseModel):
    text: str
    src: str
    trg: str

    @validator("src")
    def check_src(cls, value):
        if value not in constants.LANGUAGE_DICT:
            raise ValueError(
                "Invalid value. Source language must be one of: {}".format(
                    ", ".join(constants.LANGUAGE_DICT)
                )
            )
        return value

    @validator("trg")
    def check_trg(cls, value):
        if value not in constants.SIGNED_LANGUAGES_DICT:
            raise ValueError(
                "Invalid value. Target sign language must be one of: {}".format(
                    ", ".join(constants.SIGNED_LANGUAGES_DICT)
                )
            )
        return value


# input parameters: text: str, src_lang, target_lang
@app.post("/translate/text_to_sign", status_code=200)
async def text_to_sign(req: TextToSign):

    try:

        # translation from text to text is not needed anymore
        # translator = deepl.Translator(os.getenv("DEEPL_API_KEY"))
        # text_info = translator.translate_text(req.text, source_lang = req.src, target_lang="en-us" if req.trg == "en" else req.trg)

        # prepare params to be inserted in the GET http request
        params = {"text": req.text, "spoken": req.src, "signed": req.trg}

        # send get request to sign.mt REST API
        response = requests.get(
            utils.build_url(constants.TEXT_TO_SIGNED_BASE_URL, params)
        )
        response.raise_for_status()

        # retrieve sequence of bytes
        pose_bytes = response.content

        # convert sequence of bytes into an mp4 file
        pose = Pose.read(pose_bytes)
        v = PoseVisualizer(pose)
        file_name = datetime.now().strftime("%Y_%m_%d_%H_%M_%S.mp4")
        file_path = f"tmp/{file_name}"
        v.save_video(file_path, v.draw((0, 0, 0)))

        # encode the mp4 video in base64
        pose_base64 = utils.encode_video_to_base64(file_path)

        # remove the just created mp4
        utils.deleteFile(file_path)

        return {"pose": pose_base64}

    except Exception as e:
        return {"error": "Translation failed. Try to change the input sentence."}
        #raise HTTPException(
        #    status_code=500,
        #    detail="Internal Server Error: Something went wrong. [ERROR: '"
        #    + str(e)
        #    + "']",
        #)


# Object tha represents a SignToText request.
class SignToText(BaseModel):
    base64Video: str
    src: str
    trg: str
    videoType: str

    # @validator('src')
    # def check_src(cls, value):
    #    if value not in constants.LANGUAGE_DICT:
    #        raise ValueError('Invalid value. Source language must be one of: {}'.format(', '.join(constants.LANGUAGE_DICT)))
    #    return value

    # @validator('trg')
    # def check_trg(cls, value):
    #    if value not in constants.LANGUAGE_DICT:
    #        raise ValueError('Invalid value. Target sign language must be one of: {}'.format(', '.join(constants.LANGUAGE_DICT)))
    #    return value

    # @validator('base64Video')
    # def check_video_encoded(cls, value):
    #    if utils.isBase64(value) == False:
    #        raise ValueError('Invalid value. The input video must be base64 encoded')
    #    return value

    # input parameters: text: str, src_lang, target_lang


@app.post("/translate/sign_to_text", status_code=200)
async def sign_to_text(req: SignToText):

    try:
        
        #check if video type is webm(recorded) or mp4 (uploaded)
        if req.videoType == "mp4":
            extension = "mp4" 
        elif req.videoType == "webm":
            extension = "webm"
        else:
            return {"error": "Invalid video format"}
        
        print(extension)
        

    
        # Decodifica la stringa base64
        video_data = base64.b64decode(req.base64Video)

        # Scrivi i dati decodificati in un file MP4
        file_name = datetime.now().strftime("%Y_%m_%d_%H_%M_%S." + extension)
        video_path = f"tmp/{file_name}"
        with open(video_path, "wb") as video_file:
            video_file.write(video_data)

        output_folder = "./tmp/" + datetime.now().strftime("%Y_%m_%d_%H_%M_%S_frames")

        if extension == "mp4":
            utils.extract_frames_best_performing(video_path, output_folder)

            #extract frames from tmp folder
            images = utils.extract_frames_from_folder(output_folder)

            if len(images) == 0:
                print("no frames. Trying lower function")
                utils.extract_frames_low(video_path, output_folder)

                images = utils.extract_frames_from_folder(output_folder)

        else:
            utils.extract_frames_low(video_path, output_folder)

            #extract frames from tmp folder
            images = utils.extract_frames_from_folder(output_folder)

            #utils.deleteFile(video_path)
            #utils.deleteFolder(output_folder)

        if len(images) == 0:
            return {"error": "Impossible to extract frames from the input video. Please, upload an higher quality video."}
        
        content = [
            {
                "type": "text",
                "text": "Please analyze this sequence of frames extracted from a video. Behave like a translator. Answer absolutely and ONLY with a UNIQUE translation from "
                + req.src
                + " sign language to english, even if the answer is not accurate. Answer only with the translation, between two quotes, answer always even if the translation is inaccurate. Focus on the hand of the speaker.'",
            }
        ]

        for image in images:
            content.append({"type": "image_url", "image_url": {"url": image}})
        
        #UNCOMMENT FOR DEBUG (AVOID TO SPEND TOKENS)
        #content = [{"type": "text", "text": "Say hi"}]

        client = OpenAI(api_key=os.environ.get("CHATGPT_API_KEY"))

        response = client.chat.completions.create(
            model=constants.CHATGPT_MODEL,
            max_tokens=1024,
            messages=[{"role": "user", "content": content}],
        )

        try:
            if (
                response != None
                and len(response.choices) > 0
                and hasattr(response.choices[0], "message")
                and hasattr(response.choices[0].message, "content")
            ):
                text = response.choices[0].message.content
                text = text.replace('"', "")

                # Call sign_to_text and await its result
                text_to_text_req = TextToText(text=text, src="en", trg=req.trg)
                text_response = await text_to_text(text_to_text_req)

                # Extract the text from the text_to_text response
                result = text_response["result"]

                return {"result": result}
        except:
            return {"error": "gpt-4o model is not able to calculate a response"}

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Internal Server Error: Something went wrong. [ERROR: '"
            + str(e)
            + "']",
        )


# Object tha represents a SignToText request.
class SignToSign(BaseModel):
    base64Video: str
    src: str
    trg: str
    videoType: str
    # @validator("src")
    # def check_src(cls, value):
    #   if value not in constants.LANGUAGE_DICT:
    #      raise ValueError(
    #         "Invalid value. Source language must be one of: {}".format(
    #            ", ".join(constants.LANGUAGE_DICT)
    #       )
    #  )
    # return value

    # @validator("trg")
    # def check_trg(cls, value):
    #   if value not in constants.SIGNED_LANGUAGES_DICT:
    #      raise ValueError(
    #         "Invalid value. Target sign language must be one of: {}".format(
    #            ", ".join(constants.SIGNED_LANGUAGES_DICT)
    #       )
    #  )
    #  return value


@app.post("/translate/sign_to_sign", status_code=200)
async def sign_to_sign(req: SignToSign):

    # text = sign_to_text({"base64Video": req.base64Video, "src": req.src, "trg": req.trg})
    # video = await text_to_sign({"text": text, "src": "en", "trg": "bfi"})

    # Call sign_to_text and await its result
    sign_to_text_req = SignToText(base64Video=req.base64Video, src=req.src, trg="en", videoType=req.videoType)
    text_response = await sign_to_text(sign_to_text_req)

    if "error" in text_response:
        return text_response
    
    # Extract the text from the sign_to_text response
    text = text_response["result"]

    # Call sign_to_text and await its result
    sign_to_text_req = TextToSign(text=text, src="en", trg=req.trg)
    video_response = await text_to_sign(sign_to_text_req)

    # Assume text_to_sign is another async function you have defined
    # video = await text_to_sign({"text": text, "src": "en", "trg": "bfi"})
    return video_response


# Object tha represents a SignToText request.
class AudioToText(BaseModel):
    base64Audio: str
    src: str
    trg: str

    @validator("src")
    def check_src(cls, value):
        if value not in constants.LANGUAGE_DICT:
            raise ValueError(
                "Invalid value. Source language must be one of: {}".format(
                    ", ".join(constants.LANGUAGE_DICT)
                )
            )
        return value

    @validator("trg")
    def check_trg(cls, value):
        if value not in constants.LANGUAGE_DICT:
            raise ValueError(
                "Invalid value. Target sign language must be one of: {}".format(
                    ", ".join(constants.LANGUAGE_DICT)
                )
            )
        return value


@app.post("/translate/audio_to_text", status_code=200)
async def audio_to_text(req: AudioToText):
    file_path = "./tmp/" + datetime.now().strftime("%Y_%m_%d_%H_%M_%S.wav")
    whisper_model = whisper.load_model("base")
    utils.base64_to_audio(req.base64Audio, file_path)

    # Transcribe the audio from the buffer
    result = whisper_model.transcribe(os.path.abspath(file_path))

    utils.deleteFile(file_path)

    translator = deepl.Translator(os.getenv("DEEPL_API_KEY"))
    text_info = translator.translate_text(
        result["text"],
        source_lang=req.src,
        target_lang="en-us" if req.trg == "en" else req.trg,
    )
    return {"result": str(text_info)}


# Object tha represents a SignToText request.
class AudioToSign(BaseModel):
    base64Audio: str
    src: str
    trg: str

    @validator("src")
    def check_src(cls, value):
        if value not in constants.LANGUAGE_DICT:
            raise ValueError(
                "Invalid value. Source language must be one of: {}".format(
                    ", ".join(constants.LANGUAGE_DICT)
                )
            )
        return value

    @validator("trg")
    def check_trg(cls, value):
        if value not in constants.SIGNED_LANGUAGES_DICT:
            raise ValueError(
                "Invalid value. Target sign language must be one of: {}".format(
                    ", ".join(constants.SIGNED_LANGUAGES_DICT)
                )
            )
        return value


@app.post("/translate/audio_to_sign", status_code=200)
async def audio_to_sign(req: AudioToSign):
    file_path = "./tmp/" + datetime.now().strftime("%Y_%m_%d_%H_%M_%S.wav")
    whisper_model = whisper.load_model("base")
    utils.base64_to_audio(req.base64Audio, file_path)

    # Transcribe the audio from the buffer
    result = whisper_model.transcribe(os.path.abspath(file_path))

    utils.deleteFile(file_path)

    # prepare params to be inserted in the GET http request
    params = {"text": result["text"], "spoken": req.src, "signed": req.trg}

    # send get request to sign.mt REST API
    response = requests.get(utils.build_url(constants.TEXT_TO_SIGNED_BASE_URL, params))
    response.raise_for_status()

    # retrieve sequence of bytes
    pose_bytes = response.content

    # convert sequence of bytes into an mp4 file
    pose = Pose.read(pose_bytes)
    v = PoseVisualizer(pose)
    file_name = datetime.now().strftime("%Y_%m_%d_%H_%M_%S.mp4")
    file_path = f"tmp/{file_name}"
    v.save_video(file_path, v.draw((0, 0, 0)))

    # encode the mp4 video in base64
    pose_base64 = utils.encode_video_to_base64(file_path)

    # remove the just created mp4
    utils.deleteFile(file_path)

    return {"pose": pose_base64}


# Object tha represents a SignToText request.
class TextToText(BaseModel):
    text: str
    src: str
    trg: str

    @validator("src")
    def check_src(cls, value):
        if value not in constants.LANGUAGE_DICT:
            raise ValueError(
                "Invalid value. Source language must be one of: {}".format(
                    ", ".join(constants.LANGUAGE_DICT)
                )
            )
        return value

    @validator("trg")
    def check_trg(cls, value):
        if value not in constants.LANGUAGE_DICT:
            raise ValueError(
                "Invalid value. Target sign language must be one of: {}".format(
                    ", ".join(constants.LANGUAGE_DICT)
                )
            )
        return value


@app.post("/translate/text_to_text", status_code=200)
async def text_to_text(req: TextToText):
    translator = deepl.Translator(os.getenv("DEEPL_API_KEY"))
    text_info = translator.translate_text(
        req.text,
        source_lang=req.src,
        target_lang="en-us" if req.trg == "en" else req.trg,
    )
    return {"result": str(text_info)}
