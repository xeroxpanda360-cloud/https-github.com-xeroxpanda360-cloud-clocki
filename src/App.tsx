/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Battery, BatteryCharging, Mic, MicOff, Settings } from 'lucide-react';
import { GoogleGenAI, ThinkingLevel, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const SEGMENTS: Record<string, boolean[]> = {
  '0': [true, true, true, true, true, true, false],
  '1': [false, true, true, false, false, false, false],
  '2': [true, true, false, true, true, false, true],
  '3': [true, true, true, true, false, false, true],
  '4': [false, true, true, false, false, true, true],
  '5': [true, false, true, true, false, true, true],
  '6': [true, false, true, true, true, true, true],
  '7': [true, true, true, false, false, false, false],
  '8': [true, true, true, true, true, true, true],
  '9': [true, true, true, true, false, true, true],
  ' ': [false, false, false, false, false, false, false],
  '-': [false, false, false, false, false, false, true],
};

interface DigitProps {
  char: string;
  size?: string;
  dim?: boolean;
}

const SevenSegmentDigit: React.FC<DigitProps> = ({ char, size = "h-16", dim = false }) => {
  const activeSegments = dim ? SEGMENTS[' '] : (SEGMENTS[char] || SEGMENTS[' ']);
  
  const paths = [
    "M 8 2 L 32 2 L 28 8 L 12 8 Z", // A
    "M 34 4 L 34 32 L 28 28 L 28 10 Z", // B
    "M 34 36 L 34 64 L 28 60 L 28 40 Z", // C
    "M 8 66 L 32 66 L 28 60 L 12 60 Z", // D
    "M 6 36 L 6 64 L 12 60 L 12 40 Z", // E
    "M 6 4 L 6 32 L 12 28 L 12 10 Z", // F
    "M 10 34 L 14 30 L 26 30 L 30 34 L 26 38 L 14 38 Z", // G
  ];

  return (
    <svg viewBox="0 0 40 66" className={`${size} aspect-[40/66] overflow-visible`} style={{ transform: 'skewX(-5deg)' }}>
      <g className="lcd-off-segment fill-current">
        {paths.map((p, i) => <path key={i} d={p} />)}
      </g>
      <g className="lcd-on-segment fill-current">
        {paths.map((p, i) => activeSegments[i] ? <path key={i} d={p} /> : null)}
      </g>
    </svg>
  );
};

const DigitGroup: React.FC<{ value: string | number, size?: string, count?: number }> = ({ value, size = "h-16", count = 2 }) => {
  const str = value.toString().padStart(count, '0');
  return (
    <div className="flex gap-1">
      {str.split('').map((char, i) => (
        <SevenSegmentDigit key={i} char={char} size={size} />
      ))}
    </div>
  );
};

const Colon: React.FC<{ size?: string, active?: boolean }> = ({ size = "h-16", active = true }) => {
  const isSmall = size.includes('h-6') || size.includes('h-4');
  return (
    <div className={`flex flex-col justify-center ${isSmall ? 'gap-1' : 'gap-4'} ${size} px-1`}>
      <div className={`${isSmall ? 'w-0.5 h-0.5' : 'w-2 h-2'} ${active ? 'lcd-on-segment' : 'lcd-off-segment'}`} />
      <div className={`${isSmall ? 'w-0.5 h-0.5' : 'w-2 h-2'} ${active ? 'lcd-on-segment' : 'lcd-off-segment'}`} />
    </div>
  );
};

export default function App() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState<boolean>(false);
  const [isAlarmSet, setIsAlarmSet] = useState(false);
  const [alarmTime, setAlarmTime] = useState("07:00");
  const [isSnoozeActive, setIsSnoozeActive] = useState(false);
  const [isLightOn, setIsLightOn] = useState(false);
  const [isAlarmRinging, setIsAlarmRinging] = useState(false);
  
  // Exam Timer State
  const [examTimeLeft, setExamTimeLeft] = useState<number | null>(null);
  const [examTimeSpent, setExamTimeSpent] = useState<number>(0);
  const [isExamActive, setIsExamActive] = useState(false);
  const [examTotalSeconds, setExamTotalSeconds] = useState<number>(4 * 3600);
  
  // Chatbot State
  const [isChatbotActive, setIsChatbotActive] = useState(false);
  const [isWakeWordListening, setIsWakeWordListening] = useState(true);
  const [chatbotContext, setChatbotContext] = useState<string>("");
  const [currentSubtitle, setCurrentSubtitle] = useState<string>("");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [casioClickCount, setCasioClickCount] = useState(0);
  const [amClickCount, setAmClickCount] = useState(0);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);
  const [isStealthMode, setIsStealthMode] = useState(false);
  const [stealthClickCount, setStealthClickCount] = useState(0);
  const [isThinking, setIsThinking] = useState(false);
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);
  const wakeLockRef = useRef<any>(null);
  
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const synthRef = useRef<SpeechSynthesis>(window.speechSynthesis);
  const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' as any }).then((result) => {
        if (result.state === 'denied') {
          setMicError("error");
        }
        result.onchange = () => {
          if (result.state === 'granted') setMicError(null);
          if (result.state === 'denied') setMicError("error");
        };
      });
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);

      // Alarm Logic
      if (isAlarmSet && !isAlarmRinging) {
        const [h, m] = alarmTime.split(':').map(Number);
        if (now.getHours() === h && now.getMinutes() === m && now.getSeconds() === 0) {
          setIsAlarmRinging(true);
          playAlarmBeep();
        }
      }

      // Auto Exam Timer Logic (9 AM to 1 PM)
      const examStart = new Date(now);
      examStart.setHours(9, 0, 0, 0);
      const totalSeconds = 4 * 3600;
      const elapsedSeconds = Math.floor((now.getTime() - examStart.getTime()) / 1000);

      if (elapsedSeconds < 0) {
        setExamTimeSpent(0);
        setExamTimeLeft(totalSeconds);
      } else if (elapsedSeconds >= totalSeconds) {
        setExamTimeSpent(totalSeconds);
        setExamTimeLeft(0);
      } else {
        setExamTimeSpent(elapsedSeconds);
        setExamTimeLeft(totalSeconds - elapsedSeconds);
      }
    }, 1000);
    return () => {
      clearInterval(timer);
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
    };
  }, [isAlarmSet, alarmTime, isAlarmRinging, isChatbotActive]);

  useEffect(() => {
    if (!isChatbotActive && isWakeWordListening) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        recognition.onresult = (event: any) => {
          const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();
          if (transcript.includes("mum")) {
            setIsChatbotActive(true);
            playFeedbackTone(880, 0.2);
          }
        };
        recognition.onend = () => {
          if (!isChatbotActive && isWakeWordListening) {
            try { recognition.start(); } catch(e) {}
          }
        };
        try { recognition.start(); } catch(e) {}
        return () => { try { recognition.stop(); } catch(e) {} };
      }
    }
  }, [isChatbotActive, isWakeWordListening]);

  useEffect(() => {
    if (isChatbotActive) {
      startListening();
    } else {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e) {}
      }
    }
  }, [isChatbotActive]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (wakeLockRef.current !== null && document.visibilityState === 'visible') {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        } catch (err) {
          console.error(`${err.name}, ${err.message}`);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const toggleWakeLock = async (active: boolean) => {
    if (active) {
      if ('wakeLock' in navigator) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
          setIsWakeLockActive(true);
          playFeedbackTone(880, 0.1);
        } catch (err) {
          console.error(`${err.name}, ${err.message}`);
        }
      } else {
        alert("Wake Lock API not supported in this browser.");
      }
    } else {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
      setIsWakeLockActive(false);
      playFeedbackTone(440, 0.1);
    }
  };

  // Hidden Trigger Logic
  const handleCasioClick = async () => {
    // If there's a mic error, try to request permission explicitly
    if (micError) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop()); // Close stream immediately
        setMicError(null);
      } catch (e) {
        console.error("Manual permission request failed:", e);
      }
    }

    setCasioClickCount(prev => {
      if (prev + 1 >= 7) {
        setIsChatbotActive(true);
        return 0;
      }
      return prev + 1;
    });
    setTimeout(() => setCasioClickCount(0), 3000);
  };

  const handleAmClick = () => {
    setAmClickCount(prev => {
      if (prev + 1 >= 5) {
        fileInputRef.current?.click();
        return 0;
      }
      return prev + 1;
    });
    setTimeout(() => setAmClickCount(0), 3000);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // For images, we might want to handle them differently, but for now we'll just set context if it's text-based
      // or just acknowledge the upload. The user asked for acceptability.
      if (file.type.startsWith('image/')) {
        setChatbotContext("An image was uploaded. Please analyze it if possible (Note: text-only model might have limits).");
      } else {
        const text = await file.text();
        setChatbotContext(text);
      }
      setIsChatbotActive(true);
      startListening();
    }
  };

  const startListening = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.error("Speech recognition not supported");
      return;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e) {}
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      if (casioClickCount === 0) playFeedbackTone(660, 0.1); 
    };

    recognition.onend = () => {
      setIsListening(false);
      // Robust restart for long sessions (5+ hours)
      if (isChatbotActive) {
        if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = setTimeout(() => {
          if (isChatbotActive) {
            try {
              recognition.start();
            } catch (e) {
              // If already started or other error, try again later
              startListening();
            }
          }
        }, 300);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Recognition Error:", event.error);
      if (event.error === 'not-allowed') {
        setMicError("denied");
        setIsChatbotActive(false);
      } else {
        setMicError("error");
      }
    };

    recognition.onresult = async (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();
      
      if (transcript.includes("stop chat") || transcript.includes("exit chat")) {
        setIsChatbotActive(false);
        synthRef.current.cancel();
        recognition.stop();
        return;
      }

      if (transcript.includes("clear chat") || transcript.includes("reset chat")) {
        setChatbotContext("");
        speakResponse("Chat context has been cleared.");
        return;
      }

      if (transcript.includes("show")) {
        setShowSubtitles(true);
        playFeedbackTone(880, 0.1);
        return;
      }

      if (transcript.includes("hide")) {
        setShowSubtitles(false);
        playFeedbackTone(440, 0.1);
        return;
      }

      if (transcript.includes("stealth mode on")) {
        setIsStealthMode(true);
        playFeedbackTone(1100, 0.05);
        return;
      }

      if (transcript.includes("stealth mode off")) {
        setIsStealthMode(false);
        playFeedbackTone(880, 0.05);
        return;
      }

      processVoiceInput(transcript);
    };

    recognition.start();
    recognitionRef.current = recognition;
  };

  const handleClockCommand = (input: string): boolean => {
    if (input.includes("what time is it") || input.includes("current time")) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      speakResponse(`The current time is ${timeStr}`);
      return true;
    }

    if (input.includes("set alarm for")) {
      const match = input.match(/(\d{1,2})[:\s]?(\d{2})?\s*(am|pm)?/i);
      if (match) {
        let hours = parseInt(match[1]);
        const minutes = match[2] ? parseInt(match[2]) : 0;
        const ampm = match[3]?.toLowerCase();

        if (ampm === 'pm' && hours < 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;

        const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        setAlarmTime(timeStr);
        setIsAlarmSet(true);
        speakResponse(`Alarm set for ${timeStr}`);
        return true;
      }
    }

    if (input.includes("check battery") || input.includes("battery level")) {
      speakResponse(`Battery is at ${batteryLevel}% and is ${isCharging ? "currently charging" : "not charging"}`);
      return true;
    }

    if (input.includes("is the alarm set") || input.includes("check alarm")) {
      if (isAlarmSet) {
        speakResponse(`Yes, the alarm is set for ${alarmTime}`);
      } else {
        speakResponse("No, the alarm is not currently set.");
      }
      return true;
    }

    if (input.includes("turn off alarm") || input.includes("cancel alarm")) {
      setIsAlarmSet(false);
      speakResponse("Alarm has been turned off.");
      return true;
    }

    if (input.includes("help") || input.includes("what can you do")) {
      speakResponse("I can check the time, set alarms, check battery, clear chat context, and toggle stealth mode. You can also upload documents for specific questions.");
      return true;
    }

    return false;
  };

  const processVoiceInput = async (input: string) => {
    playFeedbackTone(440, 0.05);

    // Check for clock commands first
    if (handleClockCommand(input)) return;

    try {
      setIsThinking(true);
      const isRAG = !!chatbotContext;
      const systemInstruction = isRAG 
        ? `CRITICAL INSTRUCTION: You are a strict document-based assistant. 
           1. Answer ONLY using the provided context. 
           2. If the answer is not in the context, say "I'm sorry, but that information is not available in the uploaded documents." 
           3. Do NOT use any external knowledge or common sense if it contradicts or is not present in the context. 
           4. Keep responses extremely concise (1-2 sentences).
           Context: ${chatbotContext}`
        : `You are a helpful AI assistant integrated into a Casio digital clock. Keep your responses extremely concise (1-2 sentences max) as they will be read aloud. You can help with general knowledge or clock-related queries. Current Time: ${currentTime.toLocaleTimeString()}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: input,
        config: {
          systemInstruction,
          thinkingConfig: isRAG ? { thinkingLevel: ThinkingLevel.HIGH } : undefined,
        },
      });

      const text = response.text || "";
      setIsThinking(false);
      speakResponse(text);
    } catch (error) {
      console.error("Gemini Error:", error);
      setIsThinking(false);
      speakResponse("I encountered an error processing your request.");
    }
  };

  const speakResponse = async (text: string) => {
    try {
      setCurrentSubtitle(text);
      setIsSpeaking(true);

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say clearly and concisely: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioData = atob(base64Audio);
        const arrayBuffer = new ArrayBuffer(audioData.length);
        const view = new Uint8Array(arrayBuffer);
        for (let i = 0; i < audioData.length; i++) {
          view[i] = audioData.charCodeAt(i);
        }

        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);
        
        source.onended = () => {
          setIsSpeaking(false);
          setCurrentSubtitle("");
        };

        source.start();
      } else {
        setIsSpeaking(false);
        setCurrentSubtitle("");
      }
    } catch (error) {
      console.error("TTS Error:", error);
      setIsSpeaking(false);
      setCurrentSubtitle("");
    }
  };

  const playFeedbackTone = (freq: number, duration: number) => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + duration);
    } catch (e) {}
  };

  const playBeep = () => {
    if (isChatbotActive) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.2);
    } catch (e) {}
  };

  const playAlarmBeep = () => {
    let count = 0;
    const interval = setInterval(() => {
      playBeep();
      count++;
      if (count >= 10) {
        clearInterval(interval);
        setIsAlarmRinging(false);
      }
    }, 500);
  };

  const startExam = (hours: number = 4) => {
    const totalSecs = hours * 3600;
    setExamTotalSeconds(totalSecs);
    setExamTimeLeft(totalSecs);
    setExamTimeSpent(0);
    setIsExamActive(true);
    playBeep();
  };

  const stopExam = () => {
    setIsExamActive(false);
    playBeep();
  };

  const resetExam = () => {
    setExamTimeLeft(null);
    setExamTimeSpent(0);
    setIsExamActive(false);
    playBeep();
  };

  const calendarDays = (() => {
    const year = currentTime.getFullYear();
    const month = currentTime.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startOffset = (firstDay + 6) % 7;
    const days = [];
    for (let i = 0; i < startOffset; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  })();

  const monthName = currentTime.toLocaleString('default', { month: 'long' }).toUpperCase();

  return (
    <div 
      className={`flex flex-col min-h-screen bg-black font-sans p-1 overflow-hidden select-none relative items-center justify-center ${isLightOn ? 'lcd-mode-light' : 'lcd-mode-classic'}`}
    >
      
      {/* LOCK OVERLAY: Prevents interaction when chatbot is active */}
      {isChatbotActive && (
        <div className="fixed inset-0 z-[200] cursor-none" onClick={(e) => e.stopPropagation()} />
      )}

      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept=".doc,.docx,.pdf,.txt,image/*" 
        onChange={handleFileUpload} 
      />

      <div className="w-full max-w-[420px] thin-frame rounded-sm p-1 relative flex flex-col items-center">
        
        <div 
          className="w-full lcd-screen rounded p-1 flex flex-col relative overflow-hidden min-h-[140px] cursor-pointer"
          onClick={() => { if (!isChatbotActive) { setIsLightOn(!isLightOn); playBeep(); } }}
        >
          {/* Removed internal subtitle display */}

          <div className="flex-1 flex items-center justify-center relative mb-1">
            <div 
              className="absolute left-0 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 font-arial font-bold cursor-pointer"
              onClick={(e) => { e.stopPropagation(); handleAmClick(); }}
            >
              <span className={`text-[20px] leading-none ${currentTime.getHours() < 12 ? "lcd-on-segment" : "lcd-off-segment"}`}>AM</span>
              <span className={`text-[20px] leading-none ${currentTime.getHours() >= 12 ? "lcd-on-segment" : "lcd-off-segment"}`}>PM</span>
            </div>

            <div className="flex items-end gap-1 ml-10">
              <DigitGroup value={currentTime.getHours() % 12 || 12} size="h-20" count={2} />
              <Colon size="h-20" active={currentTime.getSeconds() % 2 === 0} />
              <DigitGroup value={currentTime.getMinutes().toString().padStart(2, '0')} size="h-20" count={2} />
              <div className="ml-1 mb-1">
                <DigitGroup value={currentTime.getSeconds().toString().padStart(2, '0')} size="h-10" count={2} />
              </div>
            </div>
          </div>

          {/* Reorganized Info Bar */}
          <div className="flex justify-between items-center px-2 py-0.5 border-t border-b divider-h mb-1 font-arial">
            <div className="flex flex-col items-center">
              <span className="text-[7px] font-bold lcd-label uppercase">ALARM</span>
              <div className="text-[11px] font-medium lcd-on-segment leading-none">{alarmTime}</div>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[7px] font-bold lcd-label uppercase">DATE</span>
              <div className="text-[11px] font-medium lcd-on-segment leading-none">
                {['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'][currentTime.getMonth()]} {currentTime.getDate()}
              </div>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[7px] font-bold lcd-label uppercase">DAY</span>
              <div className="text-[11px] font-medium lcd-on-segment leading-none">{['SUN','MON','TUE','WED','THU','FRI','SAT'][currentTime.getDay()]}</div>
            </div>
            {!isStealthMode && (
              <>
                <div className="flex flex-col items-center">
                  <span className="text-[7px] font-bold lcd-label uppercase">TEMP</span>
                  <div className="text-[11px] font-medium lcd-on-segment leading-none">30.1°C</div>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[7px] font-bold lcd-label uppercase">SKY</span>
                  <div className="text-[11px] font-medium lcd-on-segment leading-none uppercase">SUNNY</div>
                </div>
              </>
            )}
          </div>

          {/* Subtitles Gap */}
          <div className="min-h-[24px] flex items-center justify-center mb-1">
            <AnimatePresence mode="wait">
              {currentSubtitle && showSubtitles && (
                <motion.div 
                  key={currentSubtitle}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full bg-black/40 py-1 px-2 pointer-events-none"
                >
                  <div className="text-center">
                    <span className="text-[10px] font-arial text-white/90 tracking-tight leading-none block">
                      {currentSubtitle}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Bottom Section: Centralized Elapsed Time */}
          <div className="mt-auto flex flex-col items-center justify-center font-arial pb-1">
            <div className="flex items-center gap-3 justify-center w-full">
              <div className="text-[11px] font-bold lcd-on-segment tracking-[0.1em] uppercase">ELAPSED TIME</div>
              <div className="flex items-center gap-1.5">
                <span className="text-[7px] font-bold lcd-label">HR</span>
                <DigitGroup value={Math.floor(examTimeSpent / 3600)} size="h-6" count={2} />
                <span className="text-[7px] font-bold lcd-label ml-0.5">MIN</span>
                <DigitGroup value={Math.floor((examTimeSpent % 3600) / 60)} size="h-6" count={2} />
                <span className="text-[7px] font-bold lcd-label ml-0.5">SEC</span>
                <DigitGroup value={examTimeSpent % 60} size="h-6" count={2} />
              </div>
            </div>
          </div>

          <div className="absolute top-2 right-2 flex items-center gap-3 font-arial">
            {isThinking && (
              <div className="flex items-center gap-1 text-[9px] font-bold lcd-on-segment animate-pulse">
                <span>THINKING...</span>
              </div>
            )}
            {isChatbotActive && !isThinking && (
              <div className="flex items-center gap-1 text-[9px] font-bold lcd-on-segment animate-pulse">
                <span>LIVE</span>
              </div>
            )}
          </div>
        </div>

        <div 
          className="mt-1 flex flex-col items-center cursor-pointer active:scale-95 transition-transform min-h-[30px] justify-center"
          onClick={handleCasioClick}
        >
          <div className="text-[12px] font-sans text-white/90 font-black tracking-[0.5em] uppercase mb-1">
            CASIO
          </div>
        </div>
      </div>

      {showSettings && (
        <div className="absolute inset-0 bg-black/95 backdrop-blur-md z-[110] p-8 flex flex-col items-center justify-center">
          <div className="w-full max-w-md bg-[#111] border border-white/10 p-6 rounded-lg shadow-2xl">
            <h2 className="text-xl mb-6 font-bold uppercase tracking-widest text-white/50 border-b border-white/10 pb-2">Settings</h2>
            <div className="flex flex-col gap-6">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-white/40 uppercase tracking-wider">Keep Screen On</span>
                <button 
                  onClick={() => toggleWakeLock(!isWakeLockActive)}
                  className={`px-4 py-2 rounded text-xs font-bold transition-colors ${isWakeLockActive ? 'bg-green-600 text-white' : 'bg-white/10 text-white/40'}`}
                >
                  {isWakeLockActive ? 'ACTIVE' : 'INACTIVE'}
                </button>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-white/40 uppercase tracking-wider">Document Context</span>
                <button 
                  onClick={() => { setChatbotContext(""); playFeedbackTone(440, 0.1); }}
                  className={`px-4 py-2 rounded text-xs font-bold transition-colors ${chatbotContext ? 'bg-red-600 text-white' : 'bg-white/10 text-white/40'}`}
                  disabled={!chatbotContext}
                >
                  {chatbotContext ? 'CLEAR DOCUMENT' : 'NO DOCUMENT'}
                </button>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-white/40">ALARM TIME</span>
                <input 
                  type="time" 
                  value={alarmTime} 
                  onChange={(e) => setAlarmTime(e.target.value)}
                  className="bg-white/5 border border-white/10 text-white text-xs px-2 py-1"
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-white/40">ALARM ENABLE</span>
                <button 
                  onClick={() => setIsAlarmSet(!isAlarmSet)}
                  className={`px-4 py-1 text-xs font-bold ${isAlarmSet ? 'bg-green-900/40 text-green-500 border-green-900/60' : 'bg-white/5 text-white/40 border-white/10'} border`}
                >
                  {isAlarmSet ? 'ON' : 'OFF'}
                </button>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-white/40">EXAM DURATION</span>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map(h => (
                    <button 
                      key={h}
                      onClick={() => startExam(h)}
                      className="px-3 py-1 bg-white/5 border border-white/10 text-xs hover:bg-white/20 transition-colors"
                    >
                      {h}H
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-white/40">CONTROLS</span>
                <div className="flex gap-2">
                  <button onClick={() => stopExam()} className="px-4 py-1 bg-red-900/20 border border-red-900/40 text-red-500 text-xs">STOP</button>
                  <button onClick={() => resetExam()} className="px-4 py-1 bg-white/5 border border-white/10 text-xs">RESET</button>
                </div>
              </div>
              <button 
                onClick={() => setShowSettings(false)} 
                className="mt-4 w-full py-3 bg-white/10 text-white font-bold tracking-widest hover:bg-white/20 transition-colors"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
