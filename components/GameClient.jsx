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
  const [readyToSelect, setReadyToSelect] = useState(false);
  const [activeGridTab, setActiveGridTab] = useState("attack"); // "attack" or "defense"

  // Selections
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [hasLockedSelections, setHasLockedSelections] = useState(false);
  const [timeLeft, setTimeLeft] = useState(20);
  
  // Chat and emoji
  const [messages, setMessages] = useState(initialMessages || []);
  const [newMessage, setNewMessage] = useState("");
  const [flyingEmojis, setFlyingEmojis] = useState([]);
  const [showChatPanel, setShowChatPanel] = useState(false);
  
  const chatEndRef = useRef(null);

  const isPlayer1 = gameState.player1Id === user.id;
  const myRole = isPlayer1 ? "player1" : "player2";
  const opponent = isPlayer1 ? gameState.player2 : gameState.player1;
  
  const mySelections = isPlayer1 ? gameState.player1Selections : gameState.player2Selections;
  const opponentSelections = isPlayer1 ? gameState.player2Selections : gameState.player1Selections;
  
  const myGuesses = isPlayer1 ? (gameState.player1Guesses || []) : (gameState.player2Guesses || []);
  const opponentGuesses = isPlayer1 ? (gameState.player2Guesses || []) : (gameState.player1Guesses || []);

  const isMyTurn = gameState.status === "PLAYING" && gameState.turn === user.id;

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
      if (userId === user.id && event === "selection") {
        setHasLockedSelections(true);
      }
    });

    newSocket.on("guess-result", ({ game: updatedGame, guess }) => {
      setGameState(updatedGame);
      if (guess.isWinner) {
        if (guess.userId === user.id) {
          triggerConfetti();
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
      <div className="grid grid-cols-5 gap-2 w-full aspect-[5/6] max-w-[320px] mx-auto bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800/80 shadow-2xl">
        {Array.from({ length: 30 }).map((_, index) => {
          const isSelected = selectedIndices.includes(index);
          return (
            <button
              key={index}
              disabled={hasLockedSelections}
              onClick={() => handleCellClick(index)}
              className={`rounded-xl cursor-pointer flex items-center justify-center font-display text-xs transition-all duration-200 active:scale-95 h-full w-full ${
                isSelected
                  ? "cell-selected-neon font-extrabold"
                  : "cell-btn-base font-bold"
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
      <div className="grid grid-cols-5 gap-2 w-full aspect-[5/6] max-w-[320px] mx-auto bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800/80 shadow-2xl">
        {Array.from({ length: 30 }).map((_, index) => {
          let cellClass = "cell-btn-base";
          let cellText = (index + 1).toString();
          let isDisabled = false;

          if (isOpponentBoard) {
            const hasGuessed = myGuesses.includes(index);
            const isHit = hasGuessed && (opponentSelections || []).includes(index);

            if (hasGuessed) {
              isDisabled = true;
              if (isHit) {
                cellClass = "cell-hit-neon font-black";
                cellText = "💥";
              } else {
                cellClass = "cell-miss-neon";
                cellText = "💧";
              }
            } else {
              isDisabled = !isMyTurn;
              if (isMyTurn) {
                cellClass = "cell-btn-base text-cyan-400 border-cyan-500/30 hover:border-cyan-400 hover:text-cyan-300 font-extrabold hover:scale-105 active:scale-95 cursor-pointer";
              } else {
                cellClass = "cell-btn-base opacity-40 cursor-not-allowed";
              }
            }
          } else {
            // My Defense Grid
            const isMySecretBlock = (selectedIndices || []).includes(index);
            const hasOpponentGuessed = opponentGuesses.includes(index);
            const isHit = hasOpponentGuessed && isMySecretBlock;

            isDisabled = true;

            if (isHit) {
              cellClass = "cell-hit-neon animate-shake";
              cellText = "🔥";
            } else if (hasOpponentGuessed) {
              cellClass = "cell-miss-neon";
              cellText = "💧";
            } else if (isMySecretBlock) {
              cellClass = "cell-selected-neon";
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
    <div className="min-h-screen game-theme-dark font-body text-slate-100 flex flex-col overflow-hidden relative pb-16">
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

      {/* Header */}
      <header className="w-full top-0 sticky bg-slate-900/60 backdrop-blur-xl border-b border-zinc-800/80 shadow-md z-40 flex justify-between items-center px-5 py-2 h-14">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => router.push("/")}
            className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-300 active-scale cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div>
            <p className="font-bold text-[10px] text-cyan-400 uppercase tracking-wider">Playing vs.</p>
            <h1 className="font-display font-extrabold text-sm text-white truncate max-w-[120px]">
              {opponent?.name || opponent?.email.split("@")[0]}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-zinc-800/80 px-3 py-1.5 rounded-full border border-zinc-700/50">
          <span className="material-symbols-outlined text-amber-500" style={{ fontVariationSettings: "'FILL' 1" }}>diamond</span>
          <span className="font-display font-extrabold text-xs text-zinc-300">1,250 Gems</span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-grow flex flex-col px-5 pt-4 max-w-md mx-auto w-full relative z-10">
        
        {/* LOBBY VIEW */}
        {gameState.status === "SELECTING" && !readyToSelect && !hasLockedSelections && (
          <div className="flex-grow flex flex-col justify-between py-6 gap-6">
            {/* Lobby Title */}
            <div className="text-center">
              <div className="inline-flex items-center gap-1.5 px-4 py-1 bg-cyan-950/40 rounded-full mb-3 border border-cyan-900/40">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                <span className="font-display font-extrabold text-cyan-400 text-[10px] uppercase tracking-wider">Match Found</span>
              </div>
              <h1 className="font-display text-xl font-extrabold text-white text-glow-primary">1v1 Grid Arena</h1>
              <p className="text-xs text-zinc-400 mt-0.5">Prepare for tactical battle in <span className="font-bold text-cyan-400">Neon Grid</span></p>
            </div>

            {/* Players Vs Grid */}
            <div className="w-full grid grid-cols-11 items-center gap-1">
              {/* You */}
              <div className="col-span-5 flex flex-col items-center gap-3">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-3xl overflow-hidden border-2 border-cyan-500 user-ready-glow flex items-center justify-center bg-gradient-to-tr from-cyan-600 to-indigo-600 text-white font-display font-extrabold text-xl uppercase shadow-md">
                    {user.name ? user.name[0] : user.email[0]}
                  </div>
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-cyan-500 text-white rounded-full font-bold text-[9px] shadow-md whitespace-nowrap">
                    YOU
                  </div>
                </div>
                <div className="text-center mt-1">
                  <h3 className="font-bold text-sm truncate max-w-[100px] text-white">{user.name || user.email.split("@")[0]}</h3>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <span className="material-symbols-outlined text-emerald-400 text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    <span className="text-emerald-400 font-bold text-[10px] uppercase">READY</span>
                  </div>
                </div>
              </div>

              {/* VS Badge */}
              <div className="col-span-1 flex justify-center">
                <div className="vs-badge w-10 h-10 flex items-center justify-center rounded-xl shadow-lg border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950">
                  <span className="font-display text-sm text-white italic font-extrabold">VS</span>
                </div>
              </div>

              {/* Opponent */}
              <div className="col-span-5 flex flex-col items-center gap-3">
                <div className="relative group">
                  <div className={`w-24 h-24 rounded-3xl overflow-hidden border-2 flex items-center justify-center font-display font-extrabold text-xl uppercase shadow-md transition-all ${
                    opponentJoined ? "border-purple-500 user-ready-glow bg-gradient-to-tr from-purple-600 to-pink-600 text-white" : "border-zinc-800 bg-zinc-900 grayscale opacity-40"
                  }`}>
                    {opponent?.name ? opponent.name[0] : (opponent?.email ? opponent.email[0] : "?")}
                  </div>
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-zinc-800 text-zinc-300 rounded-full font-bold text-[9px] shadow-sm whitespace-nowrap">
                    OPPONENT
                  </div>
                </div>
                <div className="text-center mt-1">
                  <h3 className="font-bold text-sm truncate max-w-[100px] text-white">{opponent?.name || opponent?.email.split("@")[0]}</h3>
                  <div className="flex items-center justify-center gap-1 mt-1 transition-all">
                    {opponentJoined ? (
                      <>
                        <span className="material-symbols-outlined text-purple-400 text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                        <span className="text-purple-400 font-bold text-[10px] uppercase">READY</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-zinc-600 text-[16px]">pending</span>
                        <span className="text-zinc-600 font-bold text-[10px] uppercase">WAITING...</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Chat card */}
            <div 
              onClick={() => sendQuickChat("Let's have a good game!")}
              className="cyber-card rounded-2xl p-4 flex items-center gap-3 cursor-pointer active-scale"
            >
              <div className="w-9 h-9 rounded-full bg-cyan-950/50 flex items-center justify-center text-cyan-400">
                <span className="material-symbols-outlined text-[20px]">forum</span>
              </div>
              <div className="flex-grow">
                <p className="text-[10px] text-zinc-400 font-bold uppercase">Quick Say</p>
                <p className="font-bold text-xs text-white">"Let's have a good game!"</p>
              </div>
              <span className="material-symbols-outlined text-zinc-600">chevron_right</span>
            </div>

            {/* Action button */}
            <div className="w-full">
              <button
                onClick={() => setReadyToSelect(true)}
                disabled={!opponentJoined}
                className="w-full h-14 action-fire-gradient rounded-xl flex items-center justify-center gap-2 text-white font-display font-extrabold text-sm shadow-md active-scale disabled:opacity-50 disabled:grayscale disabled:scale-100 cursor-pointer"
              >
                <span className="material-symbols-outlined">play_arrow</span>
                START SELECTION
              </button>
              <p className="text-center text-[10px] text-zinc-500 mt-2.5">
                {opponentJoined ? "All players present. Start hiding your blocks!" : "Waiting for opponent to join lobby..."}
              </p>
            </div>
          </div>
        )}

        {/* LOCKED WAIT SCREEN */}
        {gameState.status === "SELECTING" && (readyToSelect || hasLockedSelections) && (
          <div className="flex-grow flex flex-col justify-center items-center py-10 gap-6">
            {!hasLockedSelections ? (
              <div className="w-full flex flex-col items-center gap-6">
                <div className="text-center max-w-xs space-y-1">
                  <h3 className="font-display font-extrabold text-base text-white flex items-center justify-center gap-1">
                    <span className="material-symbols-outlined text-cyan-400 text-[22px]">shield</span>
                    Hide 5 Secret Blocks
                  </h3>
                  <p className="text-xs text-zinc-400">Tap 5 grid coordinates below to hide your blocks.</p>
                  
                  {/* Timer display */}
                  <div className="flex items-center justify-center gap-1.5 mt-3 bg-cyan-950/40 text-cyan-400 px-3.5 py-1 rounded-full font-bold text-xs w-max mx-auto border border-cyan-900/30">
                    <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                    <span>Auto-locks in {timeLeft}s</span>
                  </div>
                </div>

                {renderSelectionGrid()}

                <button
                  disabled={selectedIndices.length !== 5}
                  onClick={() => handleLockSelections()}
                  className="w-full max-w-[320px] h-12 glossy-primary text-white font-display font-extrabold text-sm rounded-xl active-scale disabled:opacity-50 disabled:cursor-not-allowed shadow-md cursor-pointer"
                >
                  Lock In Selections
                </button>
              </div>
            ) : (
              <div className="cyber-card rounded-2xl p-6 text-center max-w-sm w-full space-y-4">
                <div className="w-14 h-14 bg-cyan-950/50 text-cyan-400 rounded-full flex items-center justify-center mx-auto shadow-inner border border-cyan-900/20">
                  <span className="material-symbols-outlined text-[32px] animate-pulse">lock</span>
                </div>
                <h3 className="font-display font-extrabold text-base text-white">Selections Locked!</h3>
                <p className="text-xs text-zinc-400 font-semibold leading-relaxed">
                  Waiting for opponent to hide their blocks. The battle begins shortly!
                </p>
                <div className="pt-2">
                  <span className="material-symbols-outlined text-cyan-400 text-[28px] animate-spin">sync</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ACTIVE GAMEBOARD */}
        {gameState.status === "PLAYING" && (
          <div className="flex-grow flex flex-col py-2 gap-4">
            
            {/* score and timer panel */}
            <div className="flex justify-between items-center cyber-card rounded-2xl p-4">
              <div className="flex flex-col">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Battle Mode</span>
                <span className={`font-display font-extrabold text-sm ${isMyTurn ? "text-emerald-400 text-glow-green animate-pulse" : "text-zinc-500"}`}>
                  {isMyTurn ? "👉 YOUR TURN" : "⏳ ENEMY TURN"}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Grid Score</span>
                <span className="font-display font-extrabold text-lg text-cyan-400 text-glow-primary">
                  {(calculatedHits * 150 - calculatedMisses * 50).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Attack/Defense Toggles (Custom fit for mobile) */}
            <div className="grid grid-cols-2 gap-2 p-1.5 bg-zinc-900/80 border border-zinc-800 rounded-xl">
              <button 
                onClick={() => setActiveGridTab("attack")}
                className={`py-2 text-xs font-bold rounded-lg cursor-pointer transition-all active-scale ${
                  activeGridTab === "attack" 
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.4)] font-extrabold" 
                    : "text-zinc-400 hover:text-blue-400"
                }`}
              >
                ATTACK GRID ({myGuesses.length})
              </button>
              <button 
                onClick={() => setActiveGridTab("defense")}
                className={`py-2 text-xs font-bold rounded-lg cursor-pointer transition-all active-scale ${
                  activeGridTab === "defense" 
                    ? "bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-[0_0_12px_rgba(147,51,234,0.4)] font-extrabold" 
                    : "text-zinc-400 hover:text-purple-400"
                }`}
              >
                DEFENSE GRID ({opponentGuesses.length})
              </button>
            </div>

            {/* Grid Area */}
            <div className="flex-grow flex items-center justify-center py-2">
              {activeGridTab === "attack" ? (
                <div className="w-full flex flex-col items-center gap-1.5">
                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">target</span>
                    Select grid to fire at enemy
                  </p>
                  {renderPlayingGrid("opponent")}
                </div>
              ) : (
                <div className="w-full flex flex-col items-center gap-1.5">
                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">shield</span>
                    Your ship layout and enemy strikes
                  </p>
                  {renderPlayingGrid("player")}
                </div>
              )}
            </div>

            {/* Stats Dashboard */}
            <div className="grid grid-cols-3 gap-2 pb-2">
              <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800/80 shadow-sm flex flex-col items-center">
                <span className="text-[9px] font-bold text-zinc-500 uppercase">Hits</span>
                <span className="font-display font-extrabold text-sm text-cyan-400">{calculatedHits} / 5</span>
              </div>
              <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800/80 shadow-sm flex flex-col items-center">
                <span className="text-[9px] font-bold text-zinc-500 uppercase">Misses</span>
                <span className="font-display font-extrabold text-sm text-rose-500">{calculatedMisses}</span>
              </div>
              <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800/80 shadow-sm flex flex-col items-center">
                <span className="text-[9px] font-bold text-zinc-500 uppercase">Blocks Left</span>
                <span className="font-display font-extrabold text-sm text-amber-500">{blocksRemaining}</span>
              </div>
            </div>
          </div>
        )}

        {/* GAME FINISHED VIEW */}
        {gameState.status === "FINISHED" && (
          <div className="flex-grow flex flex-col justify-center items-center py-10 gap-6">
            <div className="cyber-card rounded-3xl p-8 text-center max-w-sm w-full space-y-4 flex flex-col items-center">
              <div className="w-16 h-16 bg-amber-950/40 text-amber-400 rounded-full flex items-center justify-center animate-bounce shadow-inner border border-amber-800/30">
                <span className="material-symbols-outlined text-[36px]">trophy</span>
              </div>
              <h2 className="font-display text-2xl font-extrabold text-white text-glow-primary">
                {gameState.winnerId === user.id ? "🏆 VICTORY!" : "💀 DEFEAT!"}
              </h2>
              <p className="text-xs text-zinc-400 font-semibold leading-relaxed">
                {gameState.winnerId === user.id 
                  ? "Outstanding prediction! You successfully pinpointed all enemy blocks." 
                  : "The enemy coordinate search revealed all your secret shields first."}
              </p>

              <button
                onClick={() => router.push("/")}
                className="w-full h-12 bg-cyan-600 hover:bg-cyan-500 text-white font-display font-extrabold text-sm rounded-xl active-scale shadow-md cursor-pointer mt-4"
              >
                Back to Lobby
              </button>
            </div>
          </div>
        )}

        {/* CHAT/EMOJI PANEL TRIGGER */}
        <div className="fixed bottom-16 left-0 w-full px-5 py-2 z-30 pointer-events-none flex justify-between items-center gap-3">
          <div className="pointer-events-auto bg-zinc-900/90 border border-zinc-800/80 rounded-full py-1.5 px-4.5 shadow-lg flex items-center gap-2">
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
            className="pointer-events-auto w-11 h-11 rounded-full bg-cyan-600 text-white flex items-center justify-center shadow-lg active-scale cursor-pointer hover:bg-cyan-500"
          >
            <span className="material-symbols-outlined">forum</span>
          </button>
        </div>

        {/* SLIDE-UP CHAT DRAWER */}
        {showChatPanel && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col justify-end">
            <div className="bg-zinc-950 rounded-t-3xl border-t border-zinc-800 flex flex-col h-[60%] max-w-md mx-auto w-full overflow-hidden shadow-2xl">
              {/* Drawer Header */}
              <div className="p-4 border-b border-zinc-800/60 bg-zinc-900/50 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-cyan-400">forum</span>
                  <h3 className="font-display font-extrabold text-sm text-white">Battle Chat</h3>
                </div>
                <button 
                  onClick={() => setShowChatPanel(false)}
                  className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-300 active-scale cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              {/* Chat list */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-500 font-semibold text-xs">
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
                        <span className="text-[9px] text-zinc-500 font-bold mb-0.5 px-1 truncate">
                          {isMe ? "You" : msg.sender.name || msg.sender.email.split("@")[0]}
                        </span>
                        <div className={`p-2.5 rounded-2xl text-xs leading-relaxed break-all ${
                          isMe 
                            ? "bg-blue-600 text-white rounded-tr-none shadow-[0_0_10px_rgba(37,99,235,0.3)]" 
                            : "bg-zinc-900 text-slate-100 rounded-tl-none border border-zinc-800/60"
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
              <form onSubmit={sendChat} className="p-4 border-t border-zinc-800/80 flex gap-2 bg-zinc-900/30">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Send match message..."
                  className="flex-1 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 text-white"
                />
                <button
                  type="submit"
                  className="p-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl active-scale flex items-center justify-center shadow-md cursor-pointer"
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
