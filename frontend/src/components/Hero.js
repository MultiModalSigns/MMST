import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import { alpha } from "@mui/material";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import PanToolIcon from "@mui/icons-material/PanTool";
import {
  InputLabel,
  MenuItem,
  Select,
  Grid,
  FormControl,
  IconButton,
  CircularProgress,
} from "@mui/material";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import MicIcon from "@mui/icons-material/Mic";
import VideocamIcon from "@mui/icons-material/Videocam";
import RestoreIcon from "@mui/icons-material/Restore";
import WaveSurfer from "wavesurfer.js";
import Tooltip from "@mui/material/Tooltip";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import { useSpeechSynthesis } from "react-speech-kit";
import { useTranslation, Trans } from "react-i18next";

export default function Hero() {
  const { t } = useTranslation(); // hook per usare le traduzioni
  const [sourceLanguage, setSourceLanguage] = useState("en");
  const [targetLanguage, setTargetLanguage] = useState("it");
  const [sourceText, setSourceText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [file, setFile] = useState(null);

  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [audioSrc, setAudioSrc] = useState("");
  const [videoSrc, setVideoSrc] = useState("");
  const [uploadedVideoSrc, setUploadedVideoSrc] = useState("");
  const [recordedVideoUrl, setRecordedVideoUrl] = useState("");
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const streamRef = useRef(null);
  const waveSurferRef = useRef(null);
  const countdownAudioRef = useRef(
    new Audio(process.env.PUBLIC_URL + "/beep.wav")
  );
  const [recordingTime, setRecordingTime] = useState(0);
  const [intervalId, setIntervalId] = useState(null);
  const { speak, voices } = useSpeechSynthesis();
  const startTimeRef = useRef(null);
  const signLanguages = ["ase", "ise", "bfi", "ssp"];
  const voiceOptions = {
    en: voices.find(
      (voice) => voice.lang === "en-AU" && voice.name === "Karen"
    ),
    it: voices.find(
      (voice) => voice.lang === "it-IT" && voice.name === "Alice"
    ),
    es:
      voices.find((voice) => voice.lang === "es-ES") ||
      voices.find((voice) => voice.lang === "es-ES"),
  };

  const languagesWithoutVideo = ["en", "es", "it"];

  const handleChangeSource = (event) => {
    setSourceLanguage(event.target.value);
    resetInputs();
  };

  const handleChangeTarget = (event) => {
    setTargetLanguage(event.target.value);
  };

  const handleSwapLanguages = () => {
    const temp = sourceLanguage;
    setSourceLanguage(targetLanguage);
    setTargetLanguage(temp);
    resetInputs();
  };

  const handleTranslate = async () => {
    resetTargetInputs();
    const newErrors = {};

    if (!sourceText && !file && !audioSrc && !recordedVideoUrl) {
      newErrors.sourceText = <Trans i18nKey="error7"> </Trans>;
      setErrors(newErrors);
      return;
    }

    let url, requestBody, headers;
    const isSourceSignLanguage = signLanguages.includes(sourceLanguage);
    const isTargetSignLanguage = signLanguages.includes(targetLanguage);

    if (isSourceSignLanguage && sourceText !== "") {
      console.log("1");
      newErrors.sourceText = <Trans i18nKey="error0"> </Trans>;
      setErrors(newErrors);
      return;
    }

    if (isSourceSignLanguage && audioSrc !== "") {
      console.log("2");

      newErrors.sourceText = <Trans i18nKey="error"> </Trans>;
      setErrors(newErrors);
      return;
    }

    if (
      isSourceSignLanguage === false &&
      (recordedVideoUrl || uploadedVideoSrc)
    ) {
      console.log("3");
      newErrors.sourceText = <Trans i18nKey="error1"> </Trans>;
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    if (sourceText) {
      if (isTargetSignLanguage) {
        ({ url, requestBody, headers } = createTextToSignRequest(
          sourceText,
          sourceLanguage,
          targetLanguage
        ));
      } else {
        ({ url, requestBody, headers } = createTextToTextRequest(
          sourceText,
          sourceLanguage,
          targetLanguage
        ));
      }
    } else if (audioSrc) {
      if (!audioSrc) {
        newErrors.audioSrc = <Trans i18nKey="error2"> </Trans>;
        setErrors(newErrors);
        setIsLoading(false);
        return;
      }
      ({ url, requestBody, headers } = await createAudioRequest(
        audioSrc,
        sourceLanguage,
        targetLanguage
      ));
    } else if (recordedVideoUrl || file) {
      if (!recordedVideoUrl && !file) {
        newErrors.videoSrc = <Trans i18nKey="error3"> </Trans>;
        setErrors(newErrors);
        setIsLoading(false);
        return;
      }
      if (isSourceSignLanguage && isTargetSignLanguage) {
        ({ url, requestBody, headers } = await createSignToSignRequest(
          recordedVideoUrl || file,
          sourceLanguage,
          targetLanguage
        ));
      } else if (isTargetSignLanguage) {
        ({ url, requestBody, headers } = await createVideoRequest(
          recordedVideoUrl || file,
          sourceLanguage,
          targetLanguage
        ));
      } else {
        ({ url, requestBody, headers } = await createVideoRequest(
          recordedVideoUrl || file,
          sourceLanguage,
          targetLanguage
        ));
      }
    } else {
      newErrors.sourceText = <Trans i18nKey="error4"> </Trans>;
      setErrors(newErrors);
      setIsLoading(false);
      return;
    }

    try {
      const response = await axios.post(url, requestBody, { headers });
      handleResponse(response, isTargetSignLanguage);
    } catch (error) {
      console.log("Something went wrong. Error: " + error);
      //console.error("Error during translation:", error);
      //console.error("Response Data:", error.response.data);
    } finally {
      setIsLoading(false);
    }
  };

  const createTextToSignRequest = (text, src, trg) => ({
    url: "http://localhost:8000/translate/text_to_sign",
    requestBody: { text, src, trg },
    headers: { "Content-Type": "application/json" },
  });

  const createTextToTextRequest = (text, src, trg) => ({
    url: "http://localhost:8000/translate/text_to_text",
    requestBody: { text, src, trg },
    headers: { "Content-Type": "application/json" },
  });

  const createAudioRequest = async (audioSrc, src, trg) => {
    const response = await fetch(audioSrc);
    const audioBlob = await response.blob();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const base64Audio = btoa(
      String.fromCharCode(...new Uint8Array(arrayBuffer))
    );

    const requestBody = {
      base64Audio: base64Audio,
      src: src,
      trg: trg,
    };

    if (signLanguages.includes(trg)) {
      return {
        url: "http://localhost:8000/translate/audio_to_sign",
        requestBody: JSON.stringify(requestBody),
        headers: { "Content-Type": "application/json" },
      };
    } else
      return {
        url: "http://localhost:8000/translate/audio_to_text",
        requestBody: JSON.stringify(requestBody),
        headers: { "Content-Type": "application/json" },
      };
  };

  const createVideoRequest = async (videoSrc, src, trg) => {
    var videoType = "webm";
    if (file) {
      videoSrc = URL.createObjectURL(file);
      videoType = "mp4";
    }

    const response = await fetch(videoSrc);
    const videoBlob = await response.blob();

    const toBase64 = (videoBlob) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(videoBlob);
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = (error) => reject(error);
      });

    const base64Video = await toBase64(videoBlob);
    console.log(base64Video);
    return {
      url: "http://localhost:8000/translate/sign_to_text",
      requestBody: JSON.stringify({ base64Video, src, trg, videoType }),
      headers: { "Content-Type": "application/json" },
    };
  };

  const createSignToSignRequest = async (videoSrc, src, trg) => {
    var videoType = "webm";
    if (file) {
      videoSrc = URL.createObjectURL(file);
      videoType = "mp4";
    }

    const response = await fetch(videoSrc);
    const videoBlob = await response.blob();

    const toBase64 = (videoBlob) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(videoBlob);
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = (error) => reject(error);
      });

    const base64Video = await toBase64(videoBlob);
    console.log(base64Video);
    return {
      url: "http://localhost:8000/translate/sign_to_sign",
      requestBody: { base64Video, src, trg, videoType },
      headers: { "Content-Type": "application/json" },
    };
  };

  const handleResponse = (response, isSignLanguage) => {
    const newErrors = {};
    if (response.status === 200) {
      if (isSignLanguage) {
        if (response.data.error !== undefined) {
          newErrors.sourceText = "Error: " + response.data.error;
          setErrors(newErrors);
        } else {
          const { pose, translatedVideo } = response.data;
          if (pose) {
            const videoUrl = createBlobUrl(pose, "video/mp4");
            setVideoSrc(videoUrl);
          }
          if (translatedVideo) {
            const videoUrl = createBlobUrl(translatedVideo, "video/mp4");
            setVideoSrc(videoUrl);
          }
        }
      } else {
        if (response.data.result !== undefined)
          setTranslatedText(response.data.result);
        else if (response.data.error !== undefined) {
          newErrors.sourceText = "Error: " + response.data.error;
          setErrors(newErrors);
        } else {
          newErrors.sourceText = <Trans i18nKey="error5"> </Trans>;
          setErrors(newErrors);
        }
      }
    } else {
      if (response.data.error !== undefined) {
        newErrors.sourceText = "Error: " + response.data.error;
        setErrors(newErrors);
      } else {
        newErrors.sourceText = <Trans i18nKey="error5"> </Trans>;
        setErrors(newErrors);
      }
    }
  };

  const createBlobUrl = (base64Data, type) => {
    const binaryString = atob(base64Data);
    const byteArray = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      byteArray[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([byteArray], { type });
    return URL.createObjectURL(blob);
  };

  const handleFileChange = (event) => {
    resetInputs();
    setTranslatedText("");

    const file = event.target.files[0];
    if (file) {
      console.log("file:" + file);
      const fileType = file.type.split("/")[0];
      if (fileType !== "video" && fileType !== "audio") {
        setErrors({ sourceText: <Trans i18nKey="error6"> </Trans> });
        return;
      }
      resetInputs();

      const fileUrl = URL.createObjectURL(file);
      console.log(fileUrl);

      if (fileType === "video") {
        setUploadedVideoSrc(fileUrl);
      } else if (fileType === "audio") {
        setAudioSrc(fileUrl);
      }
      setFile(file);
    }
  };

  const startCountdown = (seconds, callback) => {
    let remainingTime = seconds;
    const countdownInterval = () => {
      setCountdown(remainingTime);
      if (remainingTime === 0) {
        if (countdownAudioRef.current) {
          countdownAudioRef.current.play().catch((error) => {
            console.error("Error playing countdown audio:", error);
          });
        }
        setTimeout(() => {
          setCountdown("Recording!");
          setTimeout(() => {
            setCountdown(0);
            callback();
          }, 300);
        }, 1000);
      } else {
        if (countdownAudioRef.current) {
          countdownAudioRef.current.play().catch((error) => {
            console.error("Error playing countdown audio:", error);
          });
        }
        remainingTime -= 1;
        setTimeout(countdownInterval, 1000);
      }
    };
    countdownInterval();
  };

  const handleAudioRecord = async () => {
    resetInputs();
    if (isRecordingAudio) {
      mediaRecorderRef.current.stop();
      streamRef.current.getTracks().forEach((track) => track.stop());
      clearInterval(intervalId);
      setIsRecordingAudio(false);
    } else {
      startCountdown(3, async () => {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        streamRef.current = stream;

        mediaRecorderRef.current = new MediaRecorder(stream, {
          mimeType: "audio/webm",
        });

        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };

        mediaRecorderRef.current.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, {
            type: "audio/webm",
          });
          const audioUrl = URL.createObjectURL(blob);
          setAudioSrc(audioUrl);
          recordedChunksRef.current = [];
        };

        mediaRecorderRef.current.start();
        setIsRecordingAudio(true);
        setRecordingTime(0); // Resetta il timer
        startTimeRef.current = performance.now(); // Imposta l'orario di inizio

        // Avvia il timer di registrazione
        const id = setInterval(() => {
          const elapsed = Math.floor(
            (performance.now() - startTimeRef.current) / 1000
          );
          setRecordingTime(elapsed);
        }, 1000);
        setIntervalId(id);
      });
    }
  };

  const handleVideoRecord = async () => {
    resetInputs();
    if (isRecordingVideo) {
      mediaRecorderRef.current.stop();
      streamRef.current.getTracks().forEach((track) => track.stop());
      clearInterval(intervalId);
      setIsRecordingVideo(false);
    } else {
      startCountdown(3, async () => {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        streamRef.current = stream;

        mediaRecorderRef.current = new MediaRecorder(stream, {
          mimeType: "video/webm",
        });

        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };

        mediaRecorderRef.current.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, {
            type: "video/webm",
          });
          const videoUrl = URL.createObjectURL(blob);
          setRecordedVideoUrl(videoUrl);
          recordedChunksRef.current = [];
        };

        mediaRecorderRef.current.start();
        setIsRecordingVideo(true);
        setRecordingTime(0); // Resetta il timer
        startTimeRef.current = performance.now(); // Imposta l'orario di inizio

        // Avvia il timer di registrazione
        const id = setInterval(() => {
          const elapsed = Math.floor(
            (performance.now() - startTimeRef.current) / 1000
          );
          setRecordingTime(elapsed);
        }, 1000);
        setIntervalId(id);
      });
    }
  };

  useEffect(() => {
    if (audioSrc) {
      if (waveSurferRef.current) {
        waveSurferRef.current.destroy();
      }
      waveSurferRef.current = WaveSurfer.create({
        container: "#waveform",
        waveColor: "violet",
        progressColor: "purple",
      });
      waveSurferRef.current.load(audioSrc);
    }
  }, [audioSrc]);

  useEffect(() => {
    return () => {
      if (waveSurferRef.current) {
        waveSurferRef.current.destroy();
        waveSurferRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (countdownAudioRef.current) {
      countdownAudioRef.current.load();
    }
  }, []);

  const handleReset = () => {
    resetInputs();
    setTranslatedText("");
  };

  const resetInputs = () => {
    setSourceText("");
    setAudioSrc("");
    setVideoSrc("");
    setUploadedVideoSrc("");
    setRecordedVideoUrl("");
    setFile(null);
    setErrors({});
    if (waveSurferRef.current) {
      waveSurferRef.current.destroy();
      waveSurferRef.current = null;
    }
  };

  useEffect(() => {
    console.log("AudioSrc:", audioSrc);
    console.log("VideoSrc:", videoSrc);
    console.log("UploadedVideoSrc:", uploadedVideoSrc);
    console.log("RecordedVideoUrl:", recordedVideoUrl);
  }, [audioSrc, videoSrc, uploadedVideoSrc, recordedVideoUrl]);

  const resetTargetInputs = () => {
    setErrors({});
    setTranslatedText("");
    setVideoSrc("");
  };

  const handleSpeak = () => {
    const selectedVoice = voiceOptions[targetLanguage];
    speak({
      text: translatedText,
      voice: selectedVoice,
    });
  };

  const formatTime = (timeInSeconds) => {
    const minutes = String(Math.floor(timeInSeconds / 60)).padStart(2, "0");
    const seconds = String(timeInSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  const theme = useTheme();

  return (
    <Box
      id="hero"
      sx={{
        width: "100%",
        backgroundImage:
          theme.palette.mode === "light"
            ? "linear-gradient(180deg, #CEE5FD, #FFF)"
            : `linear-gradient(#02294F, ${alpha("#090E10", 0.0)})`,
        backgroundSize: "100% 20%",
        backgroundRepeat: "no-repeat",
      }}
    >
      <Container
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          pt: { xs: 14, sm: 20 },
          pb: { xs: 8, sm: 12 },
        }}
      >
        <Stack spacing={2} sx={{ width: { xs: "100%", sm: "70%" } }}>
          <Typography
            variant="h1"
            sx={{
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              alignSelf: "center",
              textAlign: "center",
              fontSize: "clamp(3.5rem, 10vw, 4rem)",
            }}
          >
            {t("title")}&nbsp;
            <Typography
              component="span"
              variant="h1"
              sx={{
                fontSize: "clamp(3rem, 10vw, 4rem)",
                color:
                  theme.palette.mode === "light"
                    ? "primary.main"
                    : "primary.light",
              }}
            >
              AI
            </Typography>
          </Typography>
          <Typography
            textAlign="center"
            color="text.secondary"
            sx={{ alignSelf: "center", width: { sm: "100%", md: "80%" } }}
          >
            {t("description")}
          </Typography>
        </Stack>
        <Box
          id="guide"
          sx={{
            mt: 4,
            alignSelf: "center",
            width: "80%",
            maxWidth: 600,
            padding: theme.spacing(4),
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: theme.shape.borderRadius,
            backgroundColor: theme.palette.background.paper,
            boxShadow: `0 0 12px 4px ${alpha(theme.palette.primary.main, 0.1)}`,
            textAlign: "center",
          }}
        >
          <Typography variant="h6" gutterBottom sx={{ color: "#D71D7A" }}>
            {t("how_to_use")}
          </Typography>
          <Typography variant="body1" paragraph>
            <Trans i18nKey="step1">
              1. Select the <b>Source</b> and{" "}
              <b>Target Languages and Modalities</b>.
            </Trans>
          </Typography>
          <Typography variant="body1" paragraph>
            <Trans i18nKey="step2">
              2. Enter <b>Text</b> in the box, upload a <b>File</b>, or record a{" "}
              <b>Speech</b> or <b>Signs</b>.
            </Trans>
          </Typography>
          <Typography variant="body1" paragraph>
            <Trans i18nKey="step3">
              3. Click on <b>Translate</b> to get the translation.
            </Trans>
          </Typography>
          <Typography variant="body1" paragraph>
            <Trans i18nKey="step4">
              4. Click on <b>Reset</b> to clear the current translation and
              start a new.
            </Trans>
          </Typography>
        </Box>
        <Box
          id="image"
          sx={{
            mt: { xs: 8, sm: 10 },
            alignSelf: "center",
            minHeight: { xs: 233, sm: 300 },
            width: "100%",
            outline: "none",
            outlineColor:
              theme.palette.mode === "light"
                ? alpha("#BFCCD9", 0.5)
                : alpha("#9CCCFC", 0.1),
            boxShadow:
              theme.palette.mode === "light"
                ? `0 0 12px 8px ${alpha("#9CCCFC", 0.2)}`
                : `0 0 24px 12px ${alpha("#033363", 0.2)}`,
          }}
        >
          <Grid
            container
            spacing={2}
            alignItems="flex-start"
            justifyContent="center"
            style={{ paddingTop: "16px", height: "100%" }}
          >
            <Grid item xs={5}>
              <FormControl fullWidth>
                <InputLabel
                  id="source-language-label"
                  sx={{
                    fontSize: "1.2rem",
                    marginBottom: "10px",
                  }}
                >
                  <Trans i18nKey="src-in"> </Trans>
                </InputLabel>

                <Select
                  labelId="source-language-label"
                  id="source-language-select"
                  value={sourceLanguage}
                  onChange={handleChangeSource}
                >
                  <MenuItem value="en">
                    🇺🇸 {<Trans i18nKey="enText"></Trans>}
                  </MenuItem>
                  <MenuItem value="it">
                    🇮🇹 {<Trans i18nKey="itText"></Trans>}
                  </MenuItem>
                  <MenuItem value="es">
                    🇪🇸 {<Trans i18nKey="esText"></Trans>}
                  </MenuItem>
                  <MenuItem value="ase">
                    <PanToolIcon
                      fontSize="small"
                      style={{ marginRight: "5px", verticalAlign: "middle" }}
                    />
                    🇺🇸 {<Trans i18nKey="asl"></Trans>}
                  </MenuItem>
                  <MenuItem value="ise">
                    <PanToolIcon
                      fontSize="small"
                      style={{ marginRight: "5px", verticalAlign: "middle" }}
                    />
                    🇮🇹 {<Trans i18nKey="lis"></Trans>}
                  </MenuItem>
                  <MenuItem value="bfi">
                    <PanToolIcon
                      fontSize="small"
                      style={{ marginRight: "5px", verticalAlign: "middle" }}
                    />
                    🇬🇧 {<Trans i18nKey="bsl"></Trans>}
                  </MenuItem>
                  <MenuItem value="ssp">
                    <PanToolIcon
                      fontSize="small"
                      style={{ marginRight: "5px", verticalAlign: "middle" }}
                    />
                    🇪🇸 {<Trans i18nKey="lse"></Trans>}
                  </MenuItem>
                </Select>
              </FormControl>

              <Box
                sx={{
                  marginTop: theme.spacing(4),
                  padding: theme.spacing(2),
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: theme.shape.borderRadius,
                  backgroundColor: theme.palette.background.paper,
                  minHeight: 200,
                }}
              >
                {!isRecordingVideo &&
                  !recordedVideoUrl &&
                  !uploadedVideoSrc &&
                  !audioSrc && (
                    <TextField
                      label={<Trans i18nKey="enter-src"></Trans>}
                      fullWidth
                      margin="normal"
                      value={sourceText}
                      onChange={(e) => {
                        setSourceText(e.target.value);
                        setErrors((prev) => ({ ...prev, sourceText: "" }));
                      }}
                      multiline
                      rows={4}
                      variant="outlined"
                      error={!!errors.sourceText}
                      helperText={errors.sourceText}
                    />
                  )}
                {uploadedVideoSrc && (
                  <Box mt={2}>
                    <video width="100%" controls>
                      <source src={uploadedVideoSrc} type="video/mp4" />
                      {t("your_browser_does_not_support_the_video_tag")}
                    </video>
                  </Box>
                )}
                {recordedVideoUrl && (
                  <Box mt={2}>
                    <video width="100%" controls>
                      <source src={recordedVideoUrl} type="video/webm" />
                      {t("your_browser_does_not_support_the_video_tag")}
                    </video>
                  </Box>
                )}
                {audioSrc && (
                  <Box mt={2} sx={{ width: "100%", height: "100px" }}>
                    <div id="waveform"></div>
                    <Button onClick={() => waveSurferRef.current.playPause()}>
                      {t("play_pause")}
                    </Button>
                  </Box>
                )}
              </Box>
            </Grid>
            <Grid item>
              <IconButton
                onClick={handleSwapLanguages}
                aria-label={t("swap_languages")}
              >
                <SwapHorizIcon />
              </IconButton>
            </Grid>
            <Grid item xs={5}>
              <FormControl fullWidth>
                <InputLabel
                  id="target-language-label"
                  sx={{
                    fontSize: "1.2rem",
                    marginBottom: "10px",
                  }}
                >
                  {<Trans i18nKey="trg-in"></Trans>}
                </InputLabel>
                <Select
                  labelId="target-language-label"
                  id="target-language-select"
                  value={targetLanguage}
                  onChange={handleChangeTarget}
                  margin="dense"
                >
                  <MenuItem value="en">
                    🇺🇸 {<Trans i18nKey="enText"></Trans>}
                  </MenuItem>
                  <MenuItem value="it">
                    🇮🇹 {<Trans i18nKey="itText"></Trans>}
                  </MenuItem>
                  <MenuItem value="es">
                    🇪🇸 {<Trans i18nKey="esText"></Trans>}
                  </MenuItem>
                  <MenuItem value="ase">
                    <PanToolIcon
                      fontSize="small"
                      style={{ marginRight: "5px", verticalAlign: "middle" }}
                    />
                    🇺🇸 {<Trans i18nKey="asl"></Trans>}
                  </MenuItem>
                  <MenuItem value="ise">
                    <PanToolIcon
                      fontSize="small"
                      style={{ marginRight: "5px", verticalAlign: "middle" }}
                    />
                    🇮🇹 {<Trans i18nKey="lis"></Trans>}
                  </MenuItem>
                  <MenuItem value="bfi">
                    <PanToolIcon
                      fontSize="small"
                      style={{ marginRight: "5px", verticalAlign: "middle" }}
                    />
                    🇬🇧 {<Trans i18nKey="bsl"></Trans>}
                  </MenuItem>
                  <MenuItem value="ssp">
                    <PanToolIcon
                      fontSize="small"
                      style={{ marginRight: "5px", verticalAlign: "middle" }}
                    />
                    🇪🇸 {<Trans i18nKey="lse"></Trans>}
                  </MenuItem>
                </Select>
              </FormControl>

              <Box
                sx={{
                  marginTop: theme.spacing(4),
                  padding: theme.spacing(2),
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: theme.shape.borderRadius,
                  backgroundColor: theme.palette.background.paper,
                  minHeight: 200,
                  position: "relative",
                }}
              >
                {isLoading ? (
                  <CircularProgress
                    size={24}
                    sx={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                ) : (
                  <>
                    {!videoSrc && (
                      <Box display="flex" alignItems="center">
                        <TextField
                          label={<Trans i18nKey="enter-trg"></Trans>}
                          fullWidth
                          margin="normal"
                          value={translatedText}
                          onChange={(e) => setTranslatedText(e.target.value)}
                          multiline
                          rows={4}
                          variant="outlined"
                          error={!!errors.sourceText}
                          helperText={errors.sourceText}
                        />
                        <Tooltip title={t("play_translation")} arrow>
                          <IconButton color="primary" onClick={handleSpeak}>
                            <VolumeUpIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    )}
                    {videoSrc && (
                      <Box mt={2}>
                        <video width="100%" controls>
                          <source src={videoSrc} type="video/mp4" />
                          {t("your_browser_does_not_support_the_video_tag")}
                        </video>
                      </Box>
                    )}
                  </>
                )}
              </Box>
            </Grid>
          </Grid>
          <Grid
            item
            xs={12}
            container
            justifyContent="center"
            spacing={2}
            sx={{ mt: 2, mb: 2 }}
          >
            <Grid item>
              <Button
                variant="contained"
                onClick={handleTranslate}
                startIcon={<PanToolIcon />}
                sx={{
                  backgroundColor: "#0471D7",
                  color: "#fff",
                  "&:hover": { backgroundColor: "#0358A7" },
                }}
              >
                {t("translate")}
              </Button>
            </Grid>
            <Grid item>
              <Tooltip title={t("supported_formats")} placement="top-end">
                <Button
                  variant="contained"
                  component="label"
                  startIcon={<AttachFileIcon />}
                  sx={{
                    backgroundColor: "#D71D7A",
                    color: "#fff",
                    "&:hover": { backgroundColor: "#C2185B" },
                  }}
                >
                  {t("upload_file")}
                  <input
                    type="file"
                    hidden
                    onChange={handleFileChange}
                    accept="video/*,audio/*"
                  />
                </Button>
              </Tooltip>
            </Grid>
            <Grid item>
              {languagesWithoutVideo.includes(sourceLanguage) && (
                <Button
                  variant="contained"
                  color="success"
                  onClick={handleAudioRecord}
                  startIcon={<MicIcon />}
                >
                  {isRecordingAudio ? (
                    <>
                      <span className="blinking-dot"></span>
                      {<Trans i18nKey="recording_speech"></Trans>} (
                      {formatTime(recordingTime)})
                    </>
                  ) : (
                    t("record_speech")
                  )}
                </Button>
              )}
            </Grid>
            {!languagesWithoutVideo.includes(sourceLanguage) && (
              <Grid item>
                <Button
                  style={{ backgroundColor: "#9E6700", color: "white" }}
                  variant="contained"
                  onClick={handleVideoRecord}
                  startIcon={<VideocamIcon />}
                >
                  {isRecordingVideo ? (
                    <>
                      <span className="blinking-dot"></span>
                      {t("recording_signs")} ({formatTime(recordingTime)})
                    </>
                  ) : (
                    t("record_signs")
                  )}
                </Button>
              </Grid>
            )}
            <Grid item>
              <Button
                variant="outlined"
                color="secondary"
                onClick={handleReset}
                startIcon={<RestoreIcon />}
              >
                {t("reset")}
              </Button>
            </Grid>
          </Grid>
        </Box>
        {countdown > 0 && (
          <Box
            sx={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              backgroundColor: "rgba(0,0,0,0.7)",
              color: "white",
              padding: "20px",
              borderRadius: "10px",
              zIndex: 1000,
              textAlign: "center",
            }}
          >
            <Typography variant="h2">{countdown}</Typography>
          </Box>
        )}
      </Container>
    </Box>
  );
}
