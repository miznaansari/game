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
    const newSocket = io(socketUrl);
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
      const rand = Math.floor(Math.random() * 64);
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
  const colors = ["block-3d-cyan", "block-3d-purple", "block-3d-orange"];

  const renderSelectionGrid = () => {
    return (
      <div className="grid grid-cols-8 gap-1.5 w-full aspect-square max-w-[360px] mx-auto bg-surface-container-low p-3.5 rounded-2xl border border-outline-variant/30 card-shadow">
        {Array.from({ length: 64 }).map((_, index) => {
          const isSelected = selectedIndices.includes(index);
          const blockColor = colors[index % colors.length];
          return (
            <button
              key={index}
              disabled={hasLockedSelections}
              onClick={() => handleCellClick(index)}
              className={`rounded-lg glossy-finish cursor-pointer flex items-center justify-center transition-all duration-100 ease-out active:scale-95 text-[10px] font-bold h-full w-full ${
                isSelected
                  ? `${blockColor} text-white font-extrabold`
                  : "bg-surface-container-highest border border-outline-variant/30 text-on-surface-variant hover:bg-primary/10 hover:text-primary"
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
      <div className={`grid grid-cols-8 gap-1.5 w-full aspect-square max-w-[360px] mx-auto bg-surface-container-low p-3.5 rounded-2xl border border-outline-variant/30 card-shadow`}>
        {Array.from({ length: 64 }).map((_, index) => {
          let bgClass = "bg-surface-container-highest border border-outline-variant/20 text-on-surface-variant";
          let cellText = (index + 1).toString();
          let isDisabled = false;

          const blockColor = colors[index % colors.length];

          if (isOpponentBoard) {
            const hasGuessed = myGuesses.includes(index);
            const isHit = hasGuessed && (opponentSelections || []).includes(index);

            if (hasGuessed) {
              isDisabled = true;
              if (isHit) {
                bgClass = "bg-gradient-to-br from-red-500 to-rose-600 text-white font-black border-b-4 border-red-950";
                cellText = "💥";
              } else {
                bgClass = "bg-surface-dim/70 text-on-surface-variant/40 border border-outline-variant/10";
                cellText = "💧";
              }
            } else {
              isDisabled = !isMyTurn;
              bgClass = isMyTurn 
                ? "bg-white hover:bg-primary-fixed border border-outline-variant/40 cursor-pointer text-primary font-bold hover:scale-105 active:scale-95" 
                : "bg-surface-container-highest/50 cursor-not-allowed opacity-60";
            }
          } else {
            // My Defense Grid
            const isMySecretBlock = (selectedIndices || []).includes(index);
            const hasOpponentGuessed = opponentGuesses.includes(index);
            const isHit = hasOpponentGuessed && isMySecretBlock;

            isDisabled = true;

            if (isHit) {
              bgClass = "bg-gradient-to-br from-red-500 to-rose-600 text-white font-black border-b-4 border-red-950 animate-shake";
              cellText = "🔥";
            } else if (hasOpponentGuessed) {
              bgClass = "bg-surface-dim/70 text-on-surface-variant/40 border border-outline-variant/10";
              cellText = "💧";
            } else if (isMySecretBlock) {
              bgClass = `${blockColor} text-white font-extrabold`;
              cellText = "🛡️";
            }
          }

          return (
            <button
              key={index}
              disabled={isDisabled}
              onClick={() => isOpponentBoard && makeGuess(index)}
              className={`rounded-lg glossy-finish flex items-center justify-center transition-all duration-100 ease-out text-[10px] font-bold h-full w-full ${bgClass}`}
            >
              {cellText}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background font-body text-on-background flex flex-col overflow-hidden relative pb-16">
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
      <header className="w-full top-0 sticky bg-surface-bright/80 backdrop-blur-xl border-b border-outline-variant/30 shadow-sm z-40 flex justify-between items-center px-5 py-2 h-14">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => router.push("/")}
            className="w-9 h-9 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant active-scale cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div>
            <p className="font-bold text-[10px] text-primary uppercase tracking-wider">Playing vs.</p>
            <h1 className="font-display font-extrabold text-sm text-on-surface truncate max-w-[120px]">
              {opponent?.name || opponent?.email.split("@")[0]}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-surface-container-high px-3 py-1.5 rounded-full border border-outline-variant/50">
          <span className="material-symbols-outlined text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>diamond</span>
          <span className="font-display font-extrabold text-xs text-on-surface-variant">1,250 Gems</span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-grow flex flex-col px-5 pt-4 max-w-md mx-auto w-full relative z-10">
        
        {/* LOBBY VIEW */}
        {gameState.status === "SELECTING" && !readyToSelect && !hasLockedSelections && (
          <div className="flex-grow flex flex-col justify-between py-6 gap-6">
            {/* Lobby Title */}
            <div className="text-center">
              <div className="inline-flex items-center gap-1.5 px-4 py-1 bg-primary/10 rounded-full mb-3 border border-primary/20">
                <span className="w-2 h-2 rounded-full bg-primary animate-ping"></span>
                <span className="font-display font-extrabold text-primary text-[10px] uppercase tracking-wider">Match Found</span>
              </div>
              <h1 className="font-display text-xl font-extrabold text-on-background">1v1 Grid Arena</h1>
              <p className="text-xs text-on-surface-variant mt-0.5">Prepare for tactical battle in <span className="font-bold text-primary">Neon Grid</span></p>
            </div>

            {/* Players Vs Grid */}
            <div className="w-full grid grid-cols-11 items-center gap-1">
              {/* You */}
              <div className="col-span-5 flex flex-col items-center gap-3">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-3xl overflow-hidden border-2 border-primary user-ready-glow flex items-center justify-center bg-gradient-to-tr from-primary to-secondary text-white font-display font-extrabold text-xl uppercase shadow-md">
                    {user.name ? user.name[0] : user.email[0]}
                  </div>
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-primary text-white rounded-full font-bold text-[9px] shadow-md whitespace-nowrap">
                    YOU
                  </div>
                </div>
                <div className="text-center mt-1">
                  <h3 className="font-bold text-sm truncate max-w-[100px]">{user.name || user.email.split("@")[0]}</h3>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <span className="material-symbols-outlined text-primary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    <span className="text-primary font-bold text-[10px] uppercase">READY</span>
                  </div>
                </div>
              </div>

              {/* VS Badge */}
              <div className="col-span-1 flex justify-center">
                <div className="vs-badge w-10 h-10 flex items-center justify-center rounded-xl shadow-lg border border-outline-variant bg-gradient-to-br from-on-background to-inverse-surface">
                  <span className="font-display text-sm text-white italic font-extrabold">VS</span>
                </div>
              </div>

              {/* Opponent */}
              <div className="col-span-5 flex flex-col items-center gap-3">
                <div className="relative group">
                  <div className={`w-24 h-24 rounded-3xl overflow-hidden border-2 flex items-center justify-center font-display font-extrabold text-xl uppercase shadow-md transition-all ${
                    opponentJoined ? "border-tertiary user-ready-glow bg-gradient-to-tr from-pink-500 to-amber-500 text-white" : "border-outline-variant bg-surface-container grayscale opacity-60"
                  }`}>
                    {opponent?.name ? opponent.name[0] : (opponent?.email ? opponent.email[0] : "?")}
                  </div>
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-surface-container-highest text-on-surface-variant rounded-full font-bold text-[9px] shadow-sm whitespace-nowrap">
                    OPPONENT
                  </div>
                </div>
                <div className="text-center mt-1">
                  <h3 className="font-bold text-sm truncate max-w-[100px]">{opponent?.name || opponent?.email.split("@")[0]}</h3>
                  <div className="flex items-center justify-center gap-1 mt-1 transition-all">
                    {opponentJoined ? (
                      <>
                        <span className="material-symbols-outlined text-tertiary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                        <span className="text-tertiary font-bold text-[10px] uppercase">READY</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-outline text-[16px]">pending</span>
                        <span className="text-outline font-bold text-[10px] uppercase">WAITING...</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Chat card */}
            <div 
              onClick={() => sendQuickChat("Let's have a good game!")}
              className="glossy-card bg-surface-container-low rounded-2xl p-4 flex items-center gap-3 cursor-pointer active-scale"
            >
              <div className="w-9 h-9 rounded-full bg-secondary/15 flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[20px]">forum</span>
              </div>
              <div className="flex-grow">
                <p className="text-[10px] text-on-surface-variant font-bold uppercase">Quick Say</p>
                <p className="font-bold text-xs text-on-surface">"Let's have a good game!"</p>
              </div>
              <span className="material-symbols-outlined text-outline">chevron_right</span>
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
              <p className="text-center text-[10px] text-outline mt-2.5">
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
                  <h3 className="font-display font-extrabold text-base text-on-surface flex items-center justify-center gap-1">
                    <span className="material-symbols-outlined text-primary text-[22px]">shield</span>
                    Hide 5 Secret Blocks
                  </h3>
                  <p className="text-xs text-on-surface-variant">Tap 5 grid coordinates below to hide your blocks.</p>
                  
                  {/* Timer display */}
                  <div className="flex items-center justify-center gap-1.5 mt-3 bg-primary/10 text-primary px-3.5 py-1 rounded-full font-bold text-xs w-max mx-auto">
                    <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                    <span>Auto-locks in {timeLeft}s</span>
                  </div>
                </div>

                {renderSelectionGrid()}

                <button
                  disabled={selectedIndices.length !== 5}
                  onClick={() => handleLockSelections()}
                  className="w-full max-w-[360px] h-12 glossy-primary text-white font-display font-extrabold text-sm rounded-xl active-scale disabled:opacity-50 disabled:cursor-not-allowed shadow-md cursor-pointer"
                >
                  Lock In Selections
                </button>
              </div>
            ) : (
              <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 text-center card-shadow max-w-sm w-full space-y-4">
                <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                  <span className="material-symbols-outlined text-[32px] animate-pulse">lock</span>
                </div>
                <h3 className="font-display font-extrabold text-base text-on-surface">Selections Locked!</h3>
                <p className="text-xs text-on-surface-variant font-semibold leading-relaxed">
                  Waiting for opponent to hide their blocks. The battle begins shortly!
                </p>
                <div className="pt-2">
                  <span className="material-symbols-outlined text-primary text-[28px] animate-spin">sync</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ACTIVE GAMEBOARD */}
        {gameState.status === "PLAYING" && (
          <div className="flex-grow flex flex-col py-2 gap-4">
            
            {/* score and timer panel */}
            <div className="flex justify-between items-center bg-surface-container-low border border-outline-variant/30 rounded-2xl p-4 card-shadow">
              <div className="flex flex-col">
                <span className="text-[10px] text-outline font-bold uppercase tracking-wider">Battle Mode</span>
                <span className={`font-display font-extrabold text-sm ${isMyTurn ? "text-[#4CAF50] animate-pulse" : "text-outline"}`}>
                  {isMyTurn ? "👉 YOUR TURN" : "⏳ ENEMY TURN"}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-outline font-bold uppercase tracking-wider">Grid Score</span>
                <span className="font-display font-extrabold text-lg text-primary">
                  {(calculatedHits * 150 - calculatedMisses * 50).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Attack/Defense Toggles (Custom fit for mobile) */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-surface-container rounded-xl">
              <button 
                onClick={() => setActiveGridTab("attack")}
                className={`py-2 text-xs font-bold rounded-lg cursor-pointer transition-all active-scale ${
                  activeGridTab === "attack" 
                    ? "bg-primary text-white shadow-md font-extrabold" 
                    : "text-on-surface-variant hover:text-primary"
                }`}
              >
                ATTACK GRID ({myGuesses.length})
              </button>
              <button 
                onClick={() => setActiveGridTab("defense")}
                className={`py-2 text-xs font-bold rounded-lg cursor-pointer transition-all active-scale ${
                  activeGridTab === "defense" 
                    ? "bg-secondary text-white shadow-md font-extrabold" 
                    : "text-on-surface-variant hover:text-secondary"
                }`}
              >
                DEFENSE GRID ({opponentGuesses.length})
              </button>
            </div>

            {/* Grid Area */}
            <div className="flex-grow flex items-center justify-center py-2">
              {activeGridTab === "attack" ? (
                <div className="w-full flex flex-col items-center gap-1.5">
                  <p className="text-[10px] text-outline font-bold uppercase tracking-wider flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">target</span>
                    Select grid to fire at enemy
                  </p>
                  {renderPlayingGrid("opponent")}
                </div>
              ) : (
                <div className="w-full flex flex-col items-center gap-1.5">
                  <p className="text-[10px] text-outline font-bold uppercase tracking-wider flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">shield</span>
                    Your ship layout and enemy strikes
                  </p>
                  {renderPlayingGrid("player")}
                </div>
              )}
            </div>

            {/* Stats Dashboard */}
            <div className="grid grid-cols-3 gap-2 pb-2">
              <div className="bg-surface-container-low p-2 rounded-xl border border-outline-variant/30 shadow-sm flex flex-col items-center">
                <span className="text-[9px] font-bold text-outline uppercase">Hits</span>
                <span className="font-display font-extrabold text-sm text-primary">{calculatedHits} / 5</span>
              </div>
              <div className="bg-surface-container-low p-2 rounded-xl border border-outline-variant/30 shadow-sm flex flex-col items-center">
                <span className="text-[9px] font-bold text-outline uppercase">Misses</span>
                <span className="font-display font-extrabold text-sm text-error">{calculatedMisses}</span>
              </div>
              <div className="bg-surface-container-low p-2 rounded-xl border border-outline-variant/30 shadow-sm flex flex-col items-center">
                <span className="text-[9px] font-bold text-outline uppercase">Blocks Left</span>
                <span className="font-display font-extrabold text-sm text-tertiary">{blocksRemaining}</span>
              </div>
            </div>
          </div>
        )}

        {/* GAME FINISHED VIEW */}
        {gameState.status === "FINISHED" && (
          <div className="flex-grow flex flex-col justify-center items-center py-10 gap-6">
            <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-8 text-center card-shadow max-w-sm w-full space-y-4 flex flex-col items-center">
              <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center animate-bounce shadow-inner">
                <span className="material-symbols-outlined text-[36px]">trophy</span>
              </div>
              <h2 className="font-display text-2xl font-extrabold text-on-surface">
                {gameState.winnerId === user.id ? "🏆 VICTORY!" : "💀 DEFEAT!"}
              </h2>
              <p className="text-xs text-on-surface-variant font-semibold leading-relaxed">
                {gameState.winnerId === user.id 
                  ? "Outstanding prediction! You successfully pinpointed all enemy blocks." 
                  : "The enemy coordinate search revealed all your secret shields first."}
              </p>

              <button
                onClick={() => router.push("/")}
                className="w-full h-12 bg-primary hover:bg-primary-container text-white font-display font-extrabold text-sm rounded-xl active-scale shadow-md cursor-pointer mt-4"
              >
                Back to Lobby
              </button>
            </div>
          </div>
        )}

        {/* CHAT/EMOJI PANEL TRIGGER */}
        <div className="fixed bottom-16 left-0 w-full px-5 py-2 z-30 pointer-events-none flex justify-between items-center gap-3">
          <div className="pointer-events-auto bg-surface-container-low border border-outline-variant/30 rounded-full py-1 px-3 shadow-md flex items-center gap-1.5">
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
            className="pointer-events-auto w-11 h-11 rounded-full bg-primary text-white flex items-center justify-center shadow-lg active-scale cursor-pointer"
          >
            <span className="material-symbols-outlined">forum</span>
          </button>
        </div>

        {/* SLIDE-UP CHAT DRAWER */}
        {showChatPanel && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex flex-col justify-end">
            <div className="bg-white rounded-t-3xl border-t border-outline-variant/30 flex flex-col h-[60%] max-w-md mx-auto w-full overflow-hidden shadow-2xl">
              {/* Drawer Header */}
              <div className="p-4 border-b border-outline-variant/20 bg-surface-container-low flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">forum</span>
                  <h3 className="font-display font-extrabold text-sm text-on-surface">Battle Chat</h3>
                </div>
                <button 
                  onClick={() => setShowChatPanel(false)}
                  className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant active-scale cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              {/* Chat list */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-outline font-semibold text-xs">
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
                        <span className="text-[9px] text-outline font-bold mb-0.5 px-1 truncate">
                          {isMe ? "You" : msg.sender.name || msg.sender.email.split("@")[0]}
                        </span>
                        <div className={`p-2.5 rounded-2xl text-xs leading-relaxed break-all ${
                          isMe 
                            ? "bg-primary text-white rounded-tr-none shadow-sm" 
                            : "bg-surface-container text-on-surface rounded-tl-none border border-outline-variant/20"
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
              <form onSubmit={sendChat} className="p-4 border-t border-outline-variant/30 flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Send match message..."
                  className="flex-1 px-4 py-2 bg-surface-container border border-outline-variant/40 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 text-on-surface"
                />
                <button
                  type="submit"
                  className="p-2.5 bg-primary hover:bg-primary-container text-white rounded-xl active-scale flex items-center justify-center shadow-md cursor-pointer"
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
