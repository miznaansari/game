"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";
import confetti from "canvas-confetti";

export default function GameClient({ game, user, initialMessages }) {
  const router = useRouter();
  const [gameState, setGameState] = useState(game);
  const [socket, setSocket] = useState(null);
  
  // Custom States
  const [opponentJoined, setOpponentJoined] = useState(false);
  const [readyToSelect, setReadyToSelect] = useState(true);
  const [activeGridTab, setActiveGridTab] = useState("attack"); // "attack" or "defense"

  // Selections
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [hasLockedSelections, setHasLockedSelections] = useState(false);
  const [timeLeft, setTimeLeft] = useState(20);
  const [firingIndex, setFiringIndex] = useState(null);
  
  // Chat and emoji
  const [messages, setMessages] = useState(initialMessages || []);
  const [newMessage, setNewMessage] = useState("");
  const [flyingEmojis, setFlyingEmojis] = useState([]);
  const [showChatPanel, setShowChatPanel] = useState(false);

  // Popups/Toasts & Forfeit state
  const [selectionsToast, setSelectionsToast] = useState(null);
  const [turnToast, setTurnToast] = useState(null);
  const [opponentForfeited, setOpponentForfeited] = useState(false);
  
  const chatEndRef = useRef(null);

  const isPlayer1 = gameState.player1Id === user.id;
  const myRole = isPlayer1 ? "player1" : "player2";
  const opponent = isPlayer1 ? gameState.player2 : gameState.player1;
  
  const mySelections = isPlayer1 ? gameState.player1Selections : gameState.player2Selections;
  const opponentSelections = isPlayer1 ? gameState.player2Selections : gameState.player1Selections;
  
  const myGuesses = isPlayer1 ? (gameState.player1Guesses || []) : (gameState.player2Guesses || []);
  const opponentGuesses = isPlayer1 ? (gameState.player2Guesses || []) : (gameState.player1Guesses || []);

  const isMyTurn = gameState.status === "PLAYING" && gameState.turn === user.id;

  const triggerHaptic = (pattern) => {
    if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
      try {
        window.navigator.vibrate(pattern);
      } catch (err) {
        // Silently catch security blocks
      }
    }
  };

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Sync locked selections
  useEffect(() => {
    if (mySelections && Array.isArray(mySelections) && mySelections.length === 5) {
      setHasLockedSelections(true);
      setSelectedIndices(mySelections);
    }
  }, [mySelections]);

  // Handle timer countdown during SELECTING phase
  useEffect(() => {
    if (gameState.status !== "SELECTING" || !readyToSelect || hasLockedSelections) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleAutoSelect();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState.status, readyToSelect, hasLockedSelections, selectedIndices]);

  // Socket setup and custom presence pings
  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";
    const newSocket = io(socketUrl, {
      transports: ["websocket"]
    });
    setSocket(newSocket);

    newSocket.on("connect", () => {
      console.log("Connected to game socket");
      newSocket.emit("join-game", { gameId: gameState.id, userId: user.id });
      // Send a presence ping to announce we are here
      newSocket.emit("send-emoji", { gameId: gameState.id, userId: user.id, emoji: "__presence_ping__" });
    });

    newSocket.on("user-joined-room", ({ userId }) => {
      if (userId !== user.id) {
        setOpponentJoined(true);
        // Reply so the opponent knows we are in the room
        newSocket.emit("send-emoji", { gameId: gameState.id, userId: user.id, emoji: "__presence_ping__" });
      }
    });

    newSocket.on("game-updated", ({ game: updatedGame, event, userId }) => {
      setGameState(updatedGame);
      setFiringIndex(null);
      if (userId === user.id && event === "selection") {
        setHasLockedSelections(true);
      }
      if (event === "forfeit") {
        setOpponentForfeited(true);
        triggerHaptic([150, 50, 150, 50, 250]);
        triggerConfetti();
      }
    });

    newSocket.on("guess-result", ({ game: updatedGame, guess }) => {
      setGameState(updatedGame);
      setFiringIndex(null);
      if (guess.userId === user.id) {
        if (guess.isWinner) {
          triggerHaptic([150, 50, 150, 50, 250]);
          triggerConfetti();
        } else if (guess.isHit) {
          triggerHaptic([100, 50, 100]);
        } else {
          triggerHaptic(40);
        }
      } else {
        if (guess.isWinner) {
          triggerHaptic([300, 100, 300]);
        } else if (guess.isHit) {
          triggerHaptic([120, 40, 120]);
        } else {
          triggerHaptic(20);
        }
      }
    });

    newSocket.on("emoji-received", ({ userId, emoji }) => {
      if (emoji === "__presence_ping__") {
        if (userId !== user.id) {
          setOpponentJoined(true);
          newSocket.emit("send-emoji", { gameId: gameState.id, userId: user.id, emoji: "__presence_pong__" });
        }
        return;
      }
      if (emoji === "__presence_pong__") {
        if (userId !== user.id) {
          setOpponentJoined(true);
        }
        return;
      }

      // Standard flying emojis
      const id = Math.random().toString();
      const leftPos = Math.random() * 60 + 20;
      setFlyingEmojis((prev) => [...prev, { id, emoji, left: `${leftPos}%` }]);

      setTimeout(() => {
        setFlyingEmojis((prev) => prev.filter((item) => item.id !== id));
      }, 2500);
    });

    newSocket.on("chat-received", (message) => {
      setMessages((prev) => [...prev, message]);
    });

    return () => {
      newSocket.disconnect();
    };
  }, [gameState.id, user.id]);

  // Auto toggle tab to attack/defense based on turn
  useEffect(() => {
    if (gameState.status === "PLAYING") {
      setActiveGridTab(isMyTurn ? "attack" : "defense");
    }
  }, [gameState.status, isMyTurn]);

  // Turn change popup transition and haptic trigger
  useEffect(() => {
    if (gameState.status !== "PLAYING") return;

    setTurnToast(isMyTurn ? "YOUR TURN" : "ENEMY TURN");
    if (isMyTurn) {
      triggerHaptic([60, 40, 60]);
    }

    const timer = setTimeout(() => {
      setTurnToast(null);
    }, 1500);

    return () => clearTimeout(timer);
  }, [isMyTurn, gameState.status]);

  // Shield selection count toast and haptic trigger
  useEffect(() => {
    if (gameState.status !== "SELECTING" || !readyToSelect || hasLockedSelections) return;

    const len = selectedIndices.length;
    if (len === 0) return;

    // Trigger minor click vibration
    triggerHaptic(15);

    const left = 5 - len;
    setSelectionsToast(
      left > 0 
        ? `${len}/5 Shields Hidden (Hide ${left} More)` 
        : "5/5 Shields Hidden (Ready to Lock!)"
    );

    const timer = setTimeout(() => {
      setSelectionsToast(null);
    }, 1200);

    return () => clearTimeout(timer);
  }, [selectedIndices, gameState.status, readyToSelect, hasLockedSelections]);

  // Sync victory confetti
  useEffect(() => {
    if (gameState.status === "FINISHED" && gameState.winnerId === user.id) {
      triggerConfetti();
    }
  }, [gameState.status, gameState.winnerId]);

  const triggerConfetti = () => {
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 },
    });
  };

  const handleCellClick = (index) => {
    if (gameState.status === "SELECTING" && !hasLockedSelections) {
      if (selectedIndices.includes(index)) {
        setSelectedIndices(selectedIndices.filter((i) => i !== index));
      } else {
        if (selectedIndices.length < 5) {
          setSelectedIndices([...selectedIndices, index]);
        }
      }
    }
  };

  const handleLockSelections = (forcedList = null) => {
    const listToSubmit = forcedList || selectedIndices;
    if (listToSubmit.length !== 5) return;

    setHasLockedSelections(true);
    if (socket) {
      socket.emit("select-blocks", {
        gameId: gameState.id,
        userId: user.id,
        selections: listToSubmit,
      });
    }
  };

  const handleAutoSelect = () => {
    let current = [...selectedIndices];
    while (current.length < 5) {
      const rand = Math.floor(Math.random() * 30);
      if (!current.includes(rand)) {
        current.push(rand);
      }
    }
    setSelectedIndices(current);
    handleLockSelections(current);
  };

  const makeGuess = (cellIndex) => {
    if (!isMyTurn || gameState.status !== "PLAYING") return;
    if (myGuesses.includes(cellIndex)) return;
    if (firingIndex !== null) return; // Prevent double trigger

    setFiringIndex(cellIndex);

    if (socket) {
      socket.emit("make-guess", {
        gameId: gameState.id,
        userId: user.id,
        cellIndex,
      });
    }
  };

  const sendEmoji = (emoji) => {
    if (socket) {
      socket.emit("send-emoji", {
        gameId: gameState.id,
        userId: user.id,
        emoji,
      });
    }
  };

  const sendChat = (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    if (socket) {
      socket.emit("send-chat", {
        gameId: gameState.id,
        userId: user.id,
        content: newMessage.trim(),
      });
      setNewMessage("");
    }
  };

  const sendQuickChat = (text) => {
    if (socket) {
      socket.emit("send-chat", {
        gameId: gameState.id,
        userId: user.id,
        content: text,
      });
    }
  };

  // Calculations
  const calculatedHits = myGuesses.filter(g => (opponentSelections || []).includes(g)).length;
  const calculatedMisses = myGuesses.filter(g => !(opponentSelections || []).includes(g)).length;
  const blocksRemaining = 5 - calculatedHits;

  // Grid Blocks Renderers
  const renderSelectionGrid = () => {
    return (
      <div className="grid grid-cols-5 gap-1.5 w-full aspect-[5/6] max-w-[280px] mx-auto bg-slate-100 p-2 rounded-2xl border border-slate-200 shadow-sm max-h-[35dvh]">
        {Array.from({ length: 30 }).map((_, index) => {
          const isSelected = selectedIndices.includes(index);
          return (
            <button
              key={index}
              disabled={hasLockedSelections}
              onClick={() => handleCellClick(index)}
              className={`rounded-xl cursor-pointer flex items-center justify-center font-display text-xs transition-all duration-200 active:scale-95 h-full w-full ${
                isSelected
                  ? "cell-selected-light font-extrabold"
                  : "cell-btn-light font-bold"
              }`}
            >
              {index + 1}
            </button>
          );
        })}
      </div>
    );
  };

  const renderPlayingGrid = (boardType) => {
    const isOpponentBoard = boardType === "opponent";
    return (
      <div className="grid grid-cols-5 gap-1.5 w-full aspect-[5/6] max-w-[285px] mx-auto bg-slate-100 p-2.5 rounded-2xl border border-slate-200 shadow-sm max-h-[38dvh]">
        {Array.from({ length: 30 }).map((_, index) => {
          let cellClass = "cell-btn-light";
          let cellText = (index + 1).toString();
          let isDisabled = false;

          if (isOpponentBoard) {
            const hasGuessed = myGuesses.includes(index);
            const isHit = hasGuessed && (opponentSelections || []).includes(index);
            const isFiring = firingIndex === index;

            if (isFiring) {
              isDisabled = true;
              cellClass = "cell-btn-light cell-loading-sonar bg-indigo-50 border-indigo-500 font-extrabold";
              cellText = "";
            } else if (hasGuessed) {
              isDisabled = true;
              if (isHit) {
                cellClass = "cell-hit-light font-black";
                cellText = "💥";
              } else {
                cellClass = "cell-miss-light";
                cellText = "💧";
              }
            } else {
              isDisabled = !isMyTurn || firingIndex !== null;
              if (isMyTurn && firingIndex === null) {
                cellClass = "cell-btn-light text-indigo-600 border-indigo-200 hover:border-indigo-400 hover:text-indigo-700 font-extrabold hover:scale-105 active:scale-95 cursor-pointer shadow-sm";
              } else {
                cellClass = "cell-btn-light opacity-50 cursor-not-allowed bg-slate-50";
              }
            }
          } else {
            // My Defense Grid
            const isMySecretBlock = (selectedIndices || []).includes(index);
            const hasOpponentGuessed = opponentGuesses.includes(index);
            const isHit = hasOpponentGuessed && isMySecretBlock;

            isDisabled = true;

            if (isHit) {
              cellClass = "cell-hit-light animate-shake";
              cellText = "🔥";
            } else if (hasOpponentGuessed) {
              cellClass = "cell-miss-light";
              cellText = "💧";
            } else if (isMySecretBlock) {
              cellClass = "cell-selected-light";
              cellText = "🛡️";
            }
          }

          return (
            <button
              key={index}
              disabled={isDisabled}
              onClick={() => isOpponentBoard && makeGuess(index)}
              className={`rounded-xl flex items-center justify-center font-display text-xs transition-all duration-200 ${cellClass}`}
            >
              {cellText}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="h-dvh max-h-dvh game-theme-light font-body text-slate-800 flex flex-col overflow-hidden relative select-none pb-16">
      {/* Floating Emojis */}
      {flyingEmojis.map((item) => (
        <span
          key={item.id}
          className="emoji-fly"
          style={{ left: item.left, bottom: "10%" }}
        >
          {item.emoji}
        </span>
      ))}

      {/* Selections Overlay Toast */}
      {selectionsToast && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
          <div className="float-toast-in bg-slate-900/90 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg border border-slate-700/50 flex items-center gap-1.5 backdrop-blur-md">
            <span className="material-symbols-outlined text-[16px] text-indigo-400">shield</span>
            <span>{selectionsToast}</span>
          </div>
        </div>
      )}

      {/* Turn Change Overlay Banner */}
      {turnToast && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
          <div className={`float-banner-in px-8 py-4 rounded-2xl shadow-xl backdrop-blur-md flex flex-col items-center border font-display font-extrabold ${
            turnToast === "YOUR TURN"
              ? "bg-emerald-500/95 border-emerald-400 text-white shadow-emerald-500/20"
              : "bg-amber-500/95 border-amber-400 text-white shadow-amber-500/20"
          }`}>
            <span className="material-symbols-outlined text-[36px] mb-1 animate-bounce">
              {turnToast === "YOUR TURN" ? "sports_esports" : "hourglass_empty"}
            </span>
            <span className="text-xl tracking-wider uppercase font-black">
              {turnToast === "YOUR TURN" ? "Your Turn! ⚔️" : "Enemy Turn! ⏳"}
            </span>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="w-full top-0 sticky bg-white/80 backdrop-blur-xl border-b border-slate-200 shadow-sm z-40 flex justify-between items-center px-5 py-2 h-14">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => router.push("/")}
            className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 active-scale cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div>
            <p className="font-bold text-[10px] text-slate-500 uppercase tracking-wider">Playing vs.</p>
            <h1 className="font-display font-extrabold text-sm text-slate-800 truncate max-w-[120px]">
              {opponent?.name || opponent?.email.split("@")[0]}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200/60">
          <span className="material-symbols-outlined text-amber-500" style={{ fontVariationSettings: "'FILL' 1" }}>diamond</span>
          <span className="font-display font-extrabold text-xs text-slate-600">1,250 Gems</span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-grow flex flex-col px-5 pt-3 max-w-md mx-auto w-full relative z-10 justify-between overflow-hidden h-[calc(100dvh-3.5rem)]">
        
        {/* LOBBY VIEW */}
        {gameState.status === "SELECTING" && !readyToSelect && !hasLockedSelections && (
          <div className="flex-grow flex flex-col justify-between py-4 gap-4">
            {/* Lobby Title */}
            <div className="text-center">
              <div className="inline-flex items-center gap-1.5 px-4 py-1 bg-indigo-50 rounded-full mb-2 border border-indigo-100/60">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping"></span>
                <span className="font-display font-extrabold text-indigo-600 text-[10px] uppercase tracking-wider">Match Found</span>
              </div>
              <h1 className="font-display text-xl font-extrabold text-slate-800">1v1 Grid Arena</h1>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">Prepare for tactical battle in <span className="font-bold text-indigo-600">Light Grid</span></p>
            </div>

            {/* Players Vs Grid */}
            <div className="w-full grid grid-cols-11 items-center gap-1">
              {/* You */}
              <div className="col-span-5 flex flex-col items-center gap-3">
                <div className="relative group">
                  <div className="w-20 h-20 rounded-3xl overflow-hidden border-2 border-indigo-500 flex items-center justify-center bg-gradient-to-tr from-indigo-500 to-blue-500 text-white font-display font-extrabold text-lg uppercase shadow-sm">
                    {user.name ? user.name[0] : user.email[0]}
                  </div>
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-indigo-600 text-white rounded-full font-bold text-[9px] shadow-sm whitespace-nowrap">
                    YOU
                  </div>
                </div>
                <div className="text-center mt-1">
                  <h3 className="font-bold text-xs truncate max-w-[100px] text-slate-800">{user.name || user.email.split("@")[0]}</h3>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <span className="material-symbols-outlined text-emerald-500 text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    <span className="text-emerald-600 font-extrabold text-[9px] uppercase">READY</span>
                  </div>
                </div>
              </div>

              {/* VS Badge */}
              <div className="col-span-1 flex justify-center">
                <div className="vs-badge w-8 h-8 flex items-center justify-center rounded-xl shadow-sm border border-slate-200 bg-white">
                  <span className="font-display text-xs text-slate-700 italic font-extrabold">VS</span>
                </div>
              </div>

              {/* Opponent */}
              <div className="col-span-5 flex flex-col items-center gap-3">
                <div className="relative group">
                  <div className={`w-20 h-20 rounded-3xl overflow-hidden border-2 flex items-center justify-center font-display font-extrabold text-lg uppercase shadow-sm transition-all ${
                    opponentJoined ? "border-pink-500 bg-gradient-to-tr from-pink-500 to-rose-500 text-white" : "border-slate-200 bg-slate-100 grayscale opacity-45 text-slate-400"
                  }`}>
                    {opponent?.name ? opponent.name[0] : (opponent?.email ? opponent.email[0] : "?")}
                  </div>
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-slate-200 text-slate-600 rounded-full font-bold text-[9px] shadow-sm whitespace-nowrap">
                    OPPONENT
                  </div>
                </div>
                <div className="text-center mt-1">
                  <h3 className="font-bold text-xs truncate max-w-[100px] text-slate-800">{opponent?.name || opponent?.email.split("@")[0]}</h3>
                  <div className="flex items-center justify-center gap-1 mt-1 transition-all">
                    {opponentJoined ? (
                      <>
                        <span className="material-symbols-outlined text-pink-500 text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                        <span className="text-pink-500 font-extrabold text-[9px] uppercase">READY</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-slate-400 text-[14px]">pending</span>
                        <span className="text-slate-400 font-extrabold text-[9px] uppercase">WAITING...</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Chat card */}
            <div 
              onClick={() => sendQuickChat("Let's have a good game!")}
              className="light-card rounded-2xl p-4 flex items-center gap-3 cursor-pointer active-scale hover:bg-slate-50 transition"
            >
              <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                <span className="material-symbols-outlined text-[20px]">forum</span>
              </div>
              <div className="flex-grow">
                <p className="text-[10px] text-slate-500 font-extrabold uppercase">Quick Say</p>
                <p className="font-bold text-xs text-slate-800">"Let's have a good game!"</p>
              </div>
              <span className="material-symbols-outlined text-slate-400">chevron_right</span>
            </div>

            {/* Action button */}
            <div className="w-full">
              <button
                onClick={() => setReadyToSelect(true)}
                disabled={!opponentJoined}
                className="w-full h-12 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 rounded-xl flex items-center justify-center gap-2 text-white font-display font-extrabold text-sm shadow-sm active-scale disabled:opacity-50 disabled:grayscale disabled:scale-100 cursor-pointer transition"
              >
                <span className="material-symbols-outlined">play_arrow</span>
                START SELECTION
              </button>
              <p className="text-center text-[10px] text-slate-500 mt-2">
                {opponentJoined ? "All players present. Start hiding your blocks!" : "Waiting for opponent to join lobby..."}
              </p>
            </div>
          </div>
        )}

        {/* LOCKED WAIT SCREEN */}
        {gameState.status === "SELECTING" && (readyToSelect || hasLockedSelections) && (
          <div className="flex-grow flex flex-col justify-center items-center py-4 gap-4">
            {!hasLockedSelections ? (
              <div className="w-full flex flex-col items-center gap-4">
                <div className="text-center max-w-xs space-y-1">
                  <h3 className="font-display font-extrabold text-base text-slate-800 flex items-center justify-center gap-1">
                    <span className="material-symbols-outlined text-indigo-600 text-[22px]">shield</span>
                    Hide 5 Secret Blocks
                  </h3>
                  <p className="text-xs text-slate-500">Tap 5 grid coordinates below to hide your blocks.</p>
                  
                  {/* Timer display */}
                  <div className="flex items-center justify-center gap-1.5 mt-2 bg-indigo-50 text-indigo-600 px-3.5 py-1 rounded-full font-bold text-xs w-max mx-auto border border-indigo-100/60">
                    <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                    <span>Auto-locks in {timeLeft}s</span>
                  </div>
                </div>

                {renderSelectionGrid()}

                <button
                  disabled={selectedIndices.length !== 5}
                  onClick={() => handleLockSelections()}
                  className="w-full max-w-[280px] h-12 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-display font-extrabold text-sm rounded-xl active-scale disabled:opacity-50 disabled:cursor-not-allowed shadow-sm cursor-pointer"
                >
                  Lock In Selections
                </button>
              </div>
            ) : (
              <div className="light-card rounded-2xl p-8 text-center max-w-sm w-full space-y-5 flex flex-col items-center">
                <div className="radar-spinner mb-2"></div>
                <h3 className="font-display font-extrabold text-base text-slate-800">Selections Locked!</h3>
                <p className="text-xs text-slate-500 font-semibold leading-relaxed max-w-[240px]">
                  {opponentJoined 
                    ? "Calibrating radar. Waiting for opponent to hide their blocks..." 
                    : "Calibrating radar. Waiting for opponent to join..."}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ACTIVE GAMEBOARD */}
        {gameState.status === "PLAYING" && (
          <div className="flex-grow flex flex-col py-2 gap-4">
            
            {/* score and timer panel */}
            <div className="flex justify-between items-center light-card rounded-2xl p-4">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Battle Mode</span>
                <span className={`font-display font-extrabold text-sm ${isMyTurn ? "text-indigo-600 animate-pulse font-extrabold" : "text-slate-400 font-bold"}`}>
                  {isMyTurn ? "👉 YOUR TURN" : "⏳ ENEMY TURN"}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Grid Score</span>
                <span className="font-display font-extrabold text-lg text-indigo-600">
                  {(calculatedHits * 150 - calculatedMisses * 50).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Attack/Defense Toggles (Custom fit for mobile) */}
            <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-200/80 border border-slate-300/40 rounded-xl">
              <button 
                onClick={() => setActiveGridTab("attack")}
                className={`py-2 text-xs font-bold rounded-lg cursor-pointer transition-all active-scale ${
                  activeGridTab === "attack" 
                    ? "bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-sm font-extrabold" 
                    : "text-slate-600 hover:text-slate-800"
                }`}
              >
                ATTACK GRID ({myGuesses.length})
              </button>
              <button 
                onClick={() => setActiveGridTab("defense")}
                className={`py-2 text-xs font-bold rounded-lg cursor-pointer transition-all active-scale ${
                  activeGridTab === "defense" 
                    ? "bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-sm font-extrabold" 
                    : "text-slate-600 hover:text-slate-800"
                }`}
              >
                DEFENSE GRID ({opponentGuesses.length})
              </button>
            </div>

            {/* Grid Area */}
            <div className="flex-grow flex items-center justify-center py-2">
              {activeGridTab === "attack" ? (
                <div className="w-full flex flex-col items-center gap-1.5">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">target</span>
                    Select grid to fire at enemy
                  </p>
                  {renderPlayingGrid("opponent")}
                </div>
              ) : (
                <div className="w-full flex flex-col items-center gap-1.5">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">shield</span>
                    Your ship layout and enemy strikes
                  </p>
                  {renderPlayingGrid("player")}
                </div>
              )}
            </div>

            {/* Stats Dashboard */}
            <div className="grid grid-cols-3 gap-2 pb-2">
              <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center">
                <span className="text-[9px] font-bold text-slate-500 uppercase">Hits</span>
                <span className="font-display font-extrabold text-sm text-indigo-600">{calculatedHits} / 5</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center">
                <span className="text-[9px] font-bold text-slate-500 uppercase">Misses</span>
                <span className="font-display font-extrabold text-sm text-rose-500">{calculatedMisses}</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center">
                <span className="text-[9px] font-bold text-slate-500 uppercase">Blocks Left</span>
                <span className="font-display font-extrabold text-sm text-amber-500">{blocksRemaining}</span>
              </div>
            </div>
          </div>
        )}

        {/* GAME FINISHED VIEW */}
        {gameState.status === "FINISHED" && (
          <div className="flex-grow flex flex-col justify-center items-center py-6 gap-6">
            <div className="light-card rounded-3xl p-8 text-center max-w-sm w-full space-y-4 flex flex-col items-center">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center animate-bounce shadow-sm border ${
                gameState.winnerId === user.id 
                  ? "bg-amber-50 text-amber-500 border-amber-200" 
                  : "bg-slate-100 text-slate-400 border-slate-200"
              }`}>
                <span className="material-symbols-outlined text-[36px]">
                  {gameState.winnerId === user.id ? "trophy" : "sentiment_very_dissatisfied"}
                </span>
              </div>
              <h2 className="font-display text-2xl font-black text-slate-800">
                {gameState.winnerId === user.id ? "🏆 VICTORY!" : "💀 DEFEAT!"}
              </h2>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                {opponentForfeited
                  ? "Your opponent disconnected from the arena. Victory declared by forfeit!"
                  : (gameState.winnerId === user.id 
                    ? "Outstanding prediction! You successfully pinpointed all enemy blocks." 
                    : "The enemy coordinate search revealed all your secret shields first.")}
              </p>

              <button
                onClick={() => router.push("/")}
                className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-display font-extrabold text-sm rounded-xl active-scale shadow-sm cursor-pointer mt-4 transition"
              >
                Back to Lobby
              </button>
            </div>
          </div>
        )}

        {/* CHAT/EMOJI PANEL TRIGGER */}
        <div className="fixed bottom-16 left-0 w-full px-5 py-2 z-30 pointer-events-none flex justify-between items-center gap-3">
          <div className="pointer-events-auto bg-white/95 border border-slate-200/80 rounded-full py-1.5 px-4.5 shadow-lg flex items-center gap-2">
            {["😂", "🔥", "💥", "👍"].map(emoji => (
              <button 
                key={emoji}
                onClick={() => sendEmoji(emoji)}
                className="text-xl active-scale cursor-pointer hover:scale-125 transition"
              >
                {emoji}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowChatPanel(true)}
            className="pointer-events-auto w-11 h-11 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg active-scale cursor-pointer hover:bg-indigo-500 transition"
          >
            <span className="material-symbols-outlined">forum</span>
          </button>
        </div>

        {/* SLIDE-UP CHAT DRAWER */}
        {showChatPanel && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex flex-col justify-end">
            <div className="bg-white rounded-t-3xl border-t border-slate-200 flex flex-col h-[60%] max-w-md mx-auto w-full overflow-hidden shadow-2xl">
              {/* Drawer Header */}
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-indigo-600">forum</span>
                  <h3 className="font-display font-extrabold text-sm text-slate-800">Battle Chat</h3>
                </div>
                <button 
                  onClick={() => setShowChatPanel(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 active-scale cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              {/* Chat list */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 font-semibold text-xs">
                    No logs yet. Speak to your rival!
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMe = msg.senderId === user.id;
                    return (
                      <div 
                        key={msg.id} 
                        className={`flex flex-col max-w-[85%] ${isMe ? "ml-auto items-end" : "mr-auto items-start"}`}
                      >
                        <span className="text-[9px] text-slate-500 font-bold mb-0.5 px-1 truncate">
                          {isMe ? "You" : msg.sender.name || msg.sender.email.split("@")[0]}
                        </span>
                        <div className={`p-2.5 rounded-2xl text-xs leading-relaxed break-all ${
                          isMe 
                            ? "bg-indigo-600 text-white rounded-tr-none shadow-sm" 
                            : "bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200/60"
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Form Input */}
              <form onSubmit={sendChat} className="p-4 border-t border-slate-200 flex gap-2 bg-slate-50">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Send match message..."
                  className="flex-1 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
                />
                <button
                  type="submit"
                  className="p-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl active-scale flex items-center justify-center shadow-md cursor-pointer transition"
                >
                  <span className="material-symbols-outlined text-[18px]">send</span>
                </button>
              </form>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
