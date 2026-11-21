import { element } from "./dom";
import { notify } from "./notifications";

interface RecognitionAlternative {
  transcript: string;
}

interface RecognitionResult extends ArrayLike<RecognitionAlternative> {
  isFinal: boolean;
}

interface RecognitionEvent extends Event {
  results: ArrayLike<RecognitionResult>;
}

interface RecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionConstructor {
  new(): SpeechRecognition;
}

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

let recognition: SpeechRecognition | null = null;
let speaking = false;

export function startVoiceInput(input: HTMLTextAreaElement, button: HTMLButtonElement): void {
  const speechWindow = window as SpeechWindow;
  const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  if (!Recognition) {
    notify("Voice input isn't supported in this browser. You can still type your message.", true);
    return;
  }
  if (recognition) {
    recognition.stop();
    return;
  }

  const control = Recognition ? new Recognition() : null;
  if (!control) return;
  recognition = control;
  const originalText = input.value;
  control.lang = navigator.language || "en-US";
  control.interimResults = true;
  control.continuous = false;
  button.classList.add("recording");
  button.setAttribute("aria-label", "Stop voice input");
  button.title = "Listening — click to stop";
  element<HTMLElement>("#voice-status").textContent = "Listening…";
  control.onresult = (event) => {
    let transcript = "";
    for (let index = 0; index < event.results.length; index += 1) {
      transcript += event.results[index][0]?.transcript ?? "";
    }
    if (transcript) {
      const separator = originalText && !originalText.endsWith(" ") ? " " : "";
      input.value = `${originalText}${separator}${transcript}`;
    }
  };
  control.onerror = (event) => {
    if (event.error !== "no-speech" && event.error !== "aborted") {
      notify(`Voice input couldn't start: ${event.error}. You can still type.`, true);
    }
  };
  control.onend = () => {
    recognition = null;
    button.classList.remove("recording");
    button.setAttribute("aria-label", "Start voice input");
    button.title = "Dictate a message";
    element<HTMLElement>("#voice-status").textContent = "";
    input.focus();
  };
  try {
    control.start();
  } catch (error) {
    recognition = null;
    button.classList.remove("recording");
    button.setAttribute("aria-label", "Start voice input");
    element<HTMLElement>("#voice-status").textContent = "";
    notify(error instanceof Error ? error.message : "Voice input couldn't start.", true);
  }
}

export function speakResponse(text: string): void {
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    notify("Spoken replies aren't supported in this browser.", true);
    return;
  }
  if (speaking) window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.onstart = () => { speaking = true; };
  utterance.onend = () => { speaking = false; };
  utterance.onerror = () => { speaking = false; };
  window.speechSynthesis.speak(utterance);
}
