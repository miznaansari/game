"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";

export default function ChatWindowClient({ user, recipientId }) {
  const router = useRouter();
  const [messages, setMessages] = useState([]);
  const [friend, setFriend] = useState(null);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [socket, setSocket] = useState(null);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [creatingGame, setCreatingGame] = useState(false);
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [gamesList, setGamesList] = useState({ activeGames: [], pastGames: [] });
  const [statsLoading, setStatsLoading] = useState(false);

  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const isInitialLoad = useRef(true);

  const [showEmojiMenu, setShowEmojiMenu] = useState(false);
  const [emojiTab, setEmojiTab] = useState("emojis"); // "emojis" | "stickers" | "gifs"
  const [gifSearchQuery, setGifSearchQuery] = useState("");
  const [gifs, setGifs] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [showDotsModal, setShowDotsModal] = useState(false);
  const [dotsRowsInput, setDotsRowsInput] = useState(4);
  const [dotsColsInput, setDotsColsInput] = useState(4);

  const EMOJIS = [
    "😀", "😂", "🤣", "😍", "🥰", "😘", "😜", "😎", "🤩", "🥳", 
    "😭", "😡", "😱", "🤯", "😴", "💩", "🔥", "✨", "🎉", "💯", 
    "👍", "👎", "❤️", "💔", "🎮", "🏆", "👾", "🧩", "🎯", "🎲", 
    "🍕", "🍺"
  ];

  const STICKERS = [
    { code: "gg", label: "GG WP", gradient: "from-[#00c6ff] to-[#0072ff]" },
    { code: "noob", label: "NOOB!", gradient: "from-[#f857a6] to-[#ff5858]" },
    { code: "victory", label: "🏆 Victory", gradient: "from-[#FFE000] to-[#799F0C]" },
    { code: "rage", label: "💥 RAGE!", gradient: "from-[#e52d27] to-[#b31217]" },
    { code: "op", label: "⭐ OP!", gradient: "from-[#f4c4f3] to-[#fc67fa]" },
    { code: "omg", label: "😲 OMG", gradient: "from-[#11998e] to-[#38ef7d]" }
  ];

  // Load GIFs from GIPHY
  useEffect(() => {
    if (emojiTab !== "gifs") return;

    let active = true;
    const fetchGifs = async () => {
      setGifLoading(true);
      try {
        const query = gifSearchQuery.trim();
        const url = query
          ? `https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=${encodeURIComponent(query)}&limit=12&rating=g`
          : `https://api.giphy.com/v1/gifs/trending?api_key=dc6zaTOxFJmzC&limit=12&rating=g`;

        const res = await fetch(url);
        if (res.ok && active) {
          const data = await res.json();
          if (data.data) {
            setGifs(data.data);
          }
        }
      } catch (err) {
        console.error("Giphy API fetch failed:", err);
      } finally {
        if (active) setGifLoading(false);
      }
    };

    const debounce = setTimeout(fetchGifs, gifSearchQuery ? 500 : 0);
    return () => {
      active = false;
      clearTimeout(debounce);
    };
  }, [gifSearchQuery, emojiTab]);

  const handleSendSticker = async (code) => {
    setShowEmojiMenu(false);
    try {
      const msgRes = await fetch(`/api/chats/${recipientId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: `[sticker:${code}]` }),
      });

      if (msgRes.ok) {
        const message = await msgRes.json();
        setMessages((prev) => [...prev, message]);
        if (socket) {
          socket.emit("send-direct-message", { recipientId, message });
        }
      }
    } catch (err) {
      console.error("Error sending sticker:", err);
    }
  };

  const handleSendGif = async (url) => {
    setShowEmojiMenu(false);
    try {
      const msgRes = await fetch(`/api/chats/${recipientId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: `[gif:${url}]` }),
      });

      if (msgRes.ok) {
        const message = await msgRes.json();
        setMessages((prev) => [...prev, message]);
        if (socket) {
          socket.emit("send-direct-message", { recipientId, message });
        }
      }
    } catch (err) {
      console.error("Error sending GIF:", err);
    }
  };

  const renderSticker = (message, code, isMe, timeStr) => {
    const sticker = STICKERS.find((s) => s.code === code) || {
      label: code.toUpperCase(),
      gradient: "from-primary to-secondary"
    };

    return (
      <div key={message.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
        <div className={`relative max-w-[60%] rounded-3xl overflow-hidden card-shadow p-0.5 bg-gradient-to-tr ${sticker.gradient}`}>
          <div className="bg-black/15 rounded-[22px] px-6 py-4 flex flex-col items-center justify-center min-w-[120px]">
            <span className={`font-display text-lg font-black uppercase tracking-wider text-white ${code === "noob" ? "animate-bounce" : ""}`}>
              {sticker.label}
            </span>
            <span className="text-[7px] text-white/70 mt-2 block self-end select-none">{timeStr}</span>
          </div>
        </div>
      </div>
    );
  };

  const renderGif = (message, url, isMe, timeStr) => {
    return (
      <div key={message.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
        <div className="max-w-[70%] rounded-2xl overflow-hidden card-shadow bg-surface-container relative group border border-outline-variant/10">
          <img src={url} alt="GIF" className="w-full h-auto max-h-48 object-contain" />
          <div className="absolute bottom-1 right-2 bg-black/40 px-1.5 py-0.5 rounded text-[8px] text-white/90 select-none">
            {timeStr}
          </div>
        </div>
      </div>
    );
  };

  // Load chat user details and history
  useEffect(() => {
    async function initChat() {
      try {
        // Load messages history
        const messagesRes = await fetch(`/api/chats/${recipientId}`);
        if (messagesRes.ok) {
          const messagesData = await messagesRes.json();
          setMessages(messagesData);
        }

        // Find friend information in user list
        const chatsRes = await fetch("/api/chats");
        if (chatsRes.ok) {
          const chatsData = await chatsRes.json();
          const activeChat = chatsData.find(c => c.friend.id === recipientId);
          if (activeChat) {
            setFriend(activeChat.friend);
          }
        }

        // Pre-cache games history
        const gamesRes = await fetch("/api/games/list");
        if (gamesRes.ok) {
          const gamesData = await gamesRes.json();
          setGamesList(gamesData);
        }
      } catch (err) {
        console.error("Error initializing chat window:", err);
      } finally {
        setLoading(false);
      }
    }
    initChat();
  }, [recipientId]);

  const fetchGamesList = async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/games/list");
      if (res.ok) {
        const data = await res.json();
        setGamesList(data);
      }
    } catch (err) {
      console.error("Failed to load games list for stats:", err);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    if (showStatsPanel) {
      fetchGamesList();
    }
  }, [showStatsPanel]);

  // Socket Connection and logic
  useEffect(() => {
    let activeSocket = window.globalSocket;
    if (!activeSocket) {
      const socketUrl = (typeof window !== "undefined" && window.location.hostname === "localhost")
        ? "http://localhost:3001"
        : (process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001");
      activeSocket = io(socketUrl, {
        transports: ["websocket"]
      });
      window.globalSocket = activeSocket;
    }
    setSocket(activeSocket);

    const handleMessageReceived = (message) => {
      // Add message if it belongs to this conversation
      if (message.senderId === recipientId && message.receiverId === user.id) {
        setMessages((prev) => [...prev, message]);
      }
    };

    const handleGlobalEvent = (e) => {
      handleMessageReceived(e.detail);
    };

    const handleFriendStatusChanged = ({ userId, status }) => {
      if (userId === recipientId) {
        setFriend((prevFriend) => {
          if (!prevFriend) return null;
          return {
            ...prevFriend,
            isOnline: status === "online"
          };
        });
      }
    };

    window.addEventListener("global-direct-message-received", handleGlobalEvent);
    activeSocket.on("friend-status-changed", handleFriendStatusChanged);

    // Query online status for recipient on load
    activeSocket.emit("get-online-status", [recipientId], (response) => {
      if (response[recipientId] !== undefined) {
        setFriend((prevFriend) => {
          if (!prevFriend) return null;
          return {
            ...prevFriend,
            isOnline: response[recipientId] === "online"
          };
        });
      }
    });

    return () => {
      window.removeEventListener("global-direct-message-received", handleGlobalEvent);
      activeSocket.off("friend-status-changed", handleFriendStatusChanged);
    };
  }, [user.id, recipientId]);

  // Reset initial load state when switching recipients
  useEffect(() => {
    isInitialLoad.current = true;
  }, [recipientId]);

  // Auto scroll to bottom
  useEffect(() => {
    if (loading) return;

    const performScroll = () => {
      if (isInitialLoad.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
        isInitialLoad.current = false;
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    };

    // Execute scroll with a tiny timeout to ensure elements are fully painted
    const timer = setTimeout(performScroll, 100);
    return () => clearTimeout(timer);
  }, [messages, loading]);

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || sending) return;

    setSending(true);
    const text = inputText;
    setInputText("");

    try {
      const res = await fetch(`/api/chats/${recipientId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });

      if (res.ok) {
        const message = await res.json();
        setMessages((prev) => [...prev, message]);

        // Emit real-time message via socket
        if (socket) {
          socket.emit("send-direct-message", { recipientId, message });
        }
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      setInputText(text); // Restore text in case of failure
    } finally {
      setSending(false);
    }
  };

  const handleSendGameInvite = async (mode, wordCount = 5, boxRows = 4, boxCols = 4) => {
    if (creatingGame) return;
    setCreatingGame(true);
    setShowAttachmentMenu(false);

    try {
      // 1. Create a game invitation via API
      const gameRes = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiverId: recipientId, mode, wordCount, boxRows, boxCols }),
      });

      if (!gameRes.ok) throw new Error("Failed to create game");
      const gameData = await gameRes.json();

      // 2. Save it as a Direct Message in database
      let inviteText = "Challenged you to play 1v1 Grid Battleship! 🎯";
      if (mode === "MEMORY") {
        inviteText = "Challenged you to play Emoji Memory Match! 🧩";
      } else if (mode === "TICTACTOE") {
        inviteText = "Challenged you to play Tic Tac Toe! ❌⭕";
      } else if (mode === "WORD_GUESS") {
        inviteText = `Challenged you to play ${wordCount} Word Guess! 📝`;
      } else if (mode === "DOTS") {
        inviteText = `Challenged you to play ${boxRows}x${boxCols} Dots & Boxes! 🎮`;
      }

      const msgRes = await fetch(`/api/chats/${recipientId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: inviteText,
          isGameInvite: true,
          inviteGameId: gameData.gameId,
          inviteMode: mode
        }),
      });

      if (msgRes.ok) {
        const message = await msgRes.json();
        setMessages((prev) => [...prev, message]);

        // 3. Emit real-time DM socket event
        if (socket) {
          socket.emit("send-direct-message", { recipientId, message });
          
          // Also trigger live push invite alert event for real-time online dashboard popup
          socket.emit("send-invite", {
            senderId: user.id,
            senderName: user.name || user.email.split("@")[0],
            receiverId: recipientId,
            gameId: gameData.gameId,
            mode
          });
        }
      }
    } catch (err) {
      console.error("Failed to send game invite:", err);
    } finally {
      setCreatingGame(false);
    }
  };

  const getInitials = (name, email) => {
    if (name) {
      return name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);
    }
    return email.substring(0, 2).toUpperCase();
  };

  const getAvatarGradient = (id) => {
    const gradients = [
      "from-pink-500 to-rose-500",
      "from-purple-500 to-indigo-500",
      "from-blue-500 to-cyan-500",
      "from-teal-500 to-emerald-500",
      "from-amber-500 to-orange-500",
    ];
    const index = id ? id.charCodeAt(0) % gradients.length : 0;
    return gradients[index];
  };

  // Compute Completed Games & Win/Loss stats with current friend
  const completedGamesWithFriend = (gamesList.pastGames || []).filter(
    (game) =>
      (game.player1Id === user.id && game.player2Id === recipientId) ||
      (game.player2Id === user.id && game.player1Id === recipientId)
  );

  const getStatsByMode = (mode) => {
    const modeGames = completedGamesWithFriend.filter((g) => g.mode === mode);
    const total = modeGames.length;
    const wins = modeGames.filter((g) => g.winnerId === user.id).length;
    const losses = modeGames.filter((g) => g.winnerId && g.winnerId !== user.id).length;
    const draws = modeGames.filter((g) => !g.winnerId).length;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
    return { total, wins, losses, draws, winRate };
  };

  const battleStats = getStatsByMode("BATTLE");
  const memoryStats = getStatsByMode("MEMORY");
  const tictactoeStats = getStatsByMode("TICTACTOE");
  const wordGuessStats = getStatsByMode("WORD_GUESS");
  const dotsStats = getStatsByMode("DOTS");

  const overallTotal = completedGamesWithFriend.length;
  const overallWins = completedGamesWithFriend.filter((g) => g.winnerId === user.id).length;
  const overallLosses = completedGamesWithFriend.filter((g) => g.winnerId && g.winnerId !== user.id).length;
  const overallDraws = completedGamesWithFriend.filter((g) => !g.winnerId).length;
  const overallWinRate = overallTotal > 0 ? Math.round((overallWins / overallTotal) * 100) : 0;

  return (
    <div className="h-[100dvh] flex flex-col bg-[#f1f5f9] w-full max-w-md md:max-w-lg lg:max-w-xl mx-auto relative border-x border-outline-variant/20 shadow-2xl overflow-hidden">
      {/* Glossymorphic Floating Blur Blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[10%] left-[5%] w-60 h-60 rounded-full bg-primary/10 blur-[80px] animate-pulse" style={{ animationDuration: '8s' }}></div>
        <div className="absolute top-[40%] right-[-15%] w-72 h-72 rounded-full bg-secondary/10 blur-[100px] animate-pulse" style={{ animationDuration: '10s' }}></div>
        <div className="absolute bottom-[20%] left-[-10%] w-64 h-64 rounded-full bg-pink-500/5 blur-[70px] animate-pulse" style={{ animationDuration: '6s' }}></div>
      </div>

      {/* Header */}
      <div className="px-4 pt-3 sticky top-0 z-30 shrink-0">
        <header className="bg-white/40 backdrop-blur-xl border border-white/40 shadow-lg flex justify-between items-center px-3 py-2 h-14 rounded-2xl">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => router.push("/chats")}
              className="w-8 h-8 rounded-full bg-white/60 hover:bg-white text-on-surface flex items-center justify-center transition-all cursor-pointer shadow-sm border border-white shrink-0 active-scale"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            </button>

            {friend ? (
              <div className="flex items-center gap-2 min-w-0">
                <div className="relative shrink-0">
                  <div className={`w-8 h-8 rounded-full bg-gradient-to-tr ${getAvatarGradient(friend.id)} flex items-center justify-center text-white font-extrabold text-[11px] shadow-sm`}>
                    {getInitials(friend.name, friend.email)}
                  </div>
                  {friend.isOnline && (
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full shadow-sm"></span>
                  )}
                </div>
                <div className="flex-grow min-w-0">
                  <h3 className="font-display font-black text-xs text-on-surface truncate leading-tight">
                    {friend.name || friend.email.split("@")[0]}
                  </h3>
                  <p className="text-[9px] font-bold text-slate-500 leading-none mt-0.5">
                    {friend.isOnline ? "Online" : "Offline"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-2 animate-pulse min-w-0">
                <div className="w-8 h-8 bg-slate-200 rounded-full shrink-0"></div>
                <div className="space-y-1 min-w-0">
                  <div className="h-3 bg-slate-200 rounded w-16"></div>
                  <div className="h-2 bg-slate-200 rounded w-10"></div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button 
              onClick={() => handleSendGameInvite("BATTLE")}
              disabled={creatingGame}
              className="w-8 h-8 rounded-full bg-primary/10 hover:bg-primary text-primary hover:text-white flex items-center justify-center border border-primary/20 transition-all cursor-pointer active-scale"
              title="Quick Invite to Battle"
            >
              <span className="material-symbols-outlined text-[16px]">sports_esports</span>
            </button>

            <button 
              onClick={() => setShowStatsPanel(true)}
              className="w-8 h-8 rounded-full bg-primary/10 hover:bg-primary text-primary hover:text-white flex items-center justify-center border border-primary/20 transition-all cursor-pointer active-scale"
              title="View Game Stats & History"
            >
              <span className="material-symbols-outlined text-[16px]">bar_chart</span>
            </button>
          </div>
        </header>
      </div>

      {/* Message Window Area */}
      <main ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 relative z-10 scroll-hide">
        {loading ? (
          <div className="space-y-4 py-4">
            <div className="flex justify-start">
              <div className="bg-surface-container h-10 w-2/3 rounded-2xl rounded-tl-none animate-pulse"></div>
            </div>
            <div className="flex justify-end">
              <div className="bg-primary/20 h-14 w-1/2 rounded-2xl rounded-tr-none animate-pulse"></div>
            </div>
            <div className="flex justify-start">
              <div className="bg-surface-container h-8 w-1/3 rounded-2xl rounded-tl-none animate-pulse"></div>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20 px-6">
            <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-outline mb-3">
              <span className="material-symbols-outlined text-[24px]">chat</span>
            </div>
            <p className="text-on-surface-variant text-xs max-w-[200px]">
              No messages yet. Type below to say hi or tap the Quick Invite button above!
            </p>
          </div>
        ) : (
          messages.map((message) => {
            const isMe = message.senderId === user.id;
            const timeStr = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            if (message.isGameInvite) {
              const inviteMode = message.inviteMode || "BATTLE";
              const gameInfo = message.game;
              const isFinished = gameInfo?.status === "FINISHED";
              
              let statusText = isMe ? "You challenged them to a match!" : "Challenged you to a match!";
              if (inviteMode === "WORD_GUESS") {
                statusText = isMe ? "You challenged them to a Word Guess match!" : "Challenged you to a Word Guess match!";
              }
              if (isFinished) {
                const winnerName = gameInfo.winnerId === user.id 
                  ? "You" 
                  : (gameInfo.winner?.name || gameInfo.winner?.email || friend?.name || friend?.email || "Opponent");
                const loserName = gameInfo.winnerId === user.id 
                  ? (friend?.name || friend?.email || "Opponent") 
                  : "You";
                statusText = gameInfo.winnerId 
                  ? `🏆 ${winnerName} won the match against ${loserName}!` 
                  : "🤝 The match ended in a draw!";
              }

              return (
                <div key={message.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className="w-64 bg-white/40 backdrop-blur-md border border-white/50 rounded-3xl p-4 shadow-md relative overflow-hidden group">
                    {/* Mode logo overlay */}
                    <div className="absolute -top-3 -right-3 text-slate-400/10 group-hover:scale-110 transition-transform">
                      <span className="material-symbols-outlined text-[64px]">
                        {inviteMode === "MEMORY" ? "extension" : (inviteMode === "TICTACTOE" ? "grid_3x3" : (inviteMode === "WORD_GUESS" ? "notes" : (inviteMode === "DOTS" ? "grid_on" : "grid_view")))}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2.5 mb-2 relative">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 border border-indigo-200/50 text-indigo-700 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[20px]">
                          {inviteMode === "MEMORY" ? "extension" : (inviteMode === "TICTACTOE" ? "grid_3x3" : (inviteMode === "WORD_GUESS" ? "notes" : (inviteMode === "DOTS" ? "grid_on" : "grid_view")))}
                        </span>
                      </div>
                      <div>
                        <h5 className="font-display font-black text-xs text-slate-800">
                          {inviteMode === "MEMORY" ? "Memory Match Challenge 🧩" : (inviteMode === "TICTACTOE" ? "Tic Tac Toe Challenge ❌⭕" : (inviteMode === "WORD_GUESS" ? "Word Guess Challenge 📝" : (inviteMode === "DOTS" ? "Dots & Boxes Challenge 🎮" : "Battle Grid Challenge 🎮")))}
                        </h5>
                        <p className="text-[8px] text-indigo-800 uppercase tracking-widest font-black">1v1 Mode</p>
                      </div>
                    </div>

                    <p className={`text-xs mb-4 pr-6 leading-relaxed ${isFinished ? "text-emerald-700 font-bold" : "text-slate-600"}`}>
                      {statusText}
                    </p>

                    <div className="flex items-center justify-between">
                      {isFinished ? (
                        <div className="flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-100 border border-emerald-200/50 px-2 py-0.5 rounded-lg">
                          <span className="material-symbols-outlined text-[12px] font-bold">military_tech</span>
                          COMPLETED
                        </div>
                      ) : (
                        <a
                          href={`/game/${message.inviteGameId}`}
                          className="px-3.5 py-1.5 bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-high hover:to-indigo-700 text-white text-xs font-black rounded-xl active-scale transition shadow-md cursor-pointer inline-flex items-center"
                        >
                          Join Match
                          <span className="material-symbols-outlined text-[14px] ml-0.5">play_arrow</span>
                        </a>
                      )}
                      <span className="text-[9px] text-slate-500 font-bold">{timeStr}</span>
                    </div>
                  </div>
                </div>
              );
            }

            const isSticker = message.content?.startsWith("[sticker:") && message.content?.endsWith("]");
            const isGif = message.content?.startsWith("[gif:") && message.content?.endsWith("]");

            if (isSticker) {
              const stickerCode = message.content.slice(9, -1);
              return renderSticker(message, stickerCode, isMe, timeStr);
            }

            if (isGif) {
              const gifUrl = message.content.slice(5, -1);
              return renderGif(message, gifUrl, isMe, timeStr);
            }

            return (
              <div key={message.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] px-4 py-2.5 rounded-2xl shadow-sm relative border ${
                    isMe
                      ? "bg-gradient-to-r from-primary to-indigo-600 text-white rounded-tr-none border-primary/25"
                      : "bg-white/40 backdrop-blur-md text-on-surface border-white/50 rounded-tl-none"
                  }`}
                >
                  <p className="text-xs leading-relaxed break-words font-medium">{message.content}</p>
                  <span className={`text-[8px] block text-right mt-1.5 select-none ${isMe ? "text-white/75" : "text-slate-500"}`}>
                    {timeStr}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} className="h-6 shrink-0" />
      </main>

      {/* Attachment Panel Sheet */}
      {showAttachmentMenu && (
        <div className="absolute bottom-[72px] left-1/2 -translate-x-1/2 w-[92%] bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-[0px_-8px_32px_rgba(0,0,0,0.15)] z-20 p-5 transition-all duration-300 animate-slide-up">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-display font-black text-sm text-slate-800">Choose Game Mode</h4>
            <button
              onClick={() => setShowAttachmentMenu(false)}
              className="w-7 h-7 rounded-full bg-white/60 hover:bg-white text-outline flex items-center justify-center cursor-pointer border border-white/80 active-scale"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {/* Battle Grid */}
            <button
              onClick={() => handleSendGameInvite("BATTLE")}
              disabled={creatingGame}
              className="flex flex-col items-center justify-center p-3 bg-white/50 hover:bg-white border border-white/80 rounded-2xl active-scale cursor-pointer transition-all text-center shadow-sm"
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-1.5 shrink-0">
                <span className="material-symbols-outlined text-[20px]">grid_view</span>
              </div>
              <span className="font-display font-black text-[10px] text-slate-800 mb-0.5">Battle Grid</span>
              <span className="text-[7px] text-slate-500 font-bold leading-tight font-medium">8x8 Grid Arena</span>
            </button>

            {/* Memory Match */}
            <button
              onClick={() => handleSendGameInvite("MEMORY")}
              disabled={creatingGame}
              className="flex flex-col items-center justify-center p-3 bg-white/50 hover:bg-white border border-white/80 rounded-2xl active-scale cursor-pointer transition-all text-center shadow-sm"
            >
              <div className="w-9 h-9 rounded-full bg-secondary/10 text-secondary flex items-center justify-center mb-1.5 shrink-0">
                <span className="material-symbols-outlined text-[20px]">extension</span>
              </div>
              <span className="font-display font-black text-[10px] text-slate-800 mb-0.5">Memory Match</span>
              <span className="text-[7px] text-slate-500 font-bold leading-tight font-medium">Emoji pairing</span>
            </button>

            {/* Tic Tac Toe */}
            <button
              onClick={() => handleSendGameInvite("TICTACTOE")}
              disabled={creatingGame}
              className="flex flex-col items-center justify-center p-3 bg-white/50 hover:bg-white border border-white/80 rounded-2xl active-scale cursor-pointer transition-all text-center shadow-sm"
            >
              <div className="w-9 h-9 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center mb-1.5 shrink-0">
                <span className="material-symbols-outlined text-[20px]">grid_3x3</span>
              </div>
              <span className="font-display font-black text-[10px] text-slate-800 mb-0.5">Tic Tac Toe</span>
              <span className="text-[7px] text-slate-500 font-bold leading-tight font-medium">3-in-a-row classic</span>
            </button>

            {/* Word Guess 4 */}
            <button
              onClick={() => handleSendGameInvite("WORD_GUESS", 4)}
              disabled={creatingGame}
              className="flex flex-col items-center justify-center p-3 bg-white/50 hover:bg-white border border-white/80 rounded-2xl active-scale cursor-pointer transition-all text-center shadow-sm"
            >
              <div className="w-9 h-9 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-1.5 shrink-0">
                <span className="material-symbols-outlined text-[20px]">notes</span>
              </div>
              <span className="font-display font-black text-[10px] text-slate-800 mb-0.5">Word Guess 4</span>
              <span className="text-[7px] text-slate-500 font-bold leading-tight font-medium">4 words chain</span>
            </button>

            {/* Word Guess 5 */}
            <button
              onClick={() => handleSendGameInvite("WORD_GUESS", 5)}
              disabled={creatingGame}
              className="flex flex-col items-center justify-center p-3 bg-white/50 hover:bg-white border border-white/80 rounded-2xl active-scale cursor-pointer transition-all text-center shadow-sm"
            >
              <div className="w-9 h-9 rounded-full bg-purple-500/10 text-purple-600 flex items-center justify-center mb-1.5 shrink-0">
                <span className="material-symbols-outlined text-[20px]">notes</span>
              </div>
              <span className="font-display font-black text-[10px] text-slate-800 mb-0.5">Word Guess 5</span>
              <span className="text-[7px] text-slate-500 font-bold leading-tight font-medium">5 words chain</span>
            </button>

            {/* Word Guess 6 */}
            <button
              onClick={() => handleSendGameInvite("WORD_GUESS", 6)}
              disabled={creatingGame}
              className="flex flex-col items-center justify-center p-3 bg-white/50 hover:bg-white border border-white/80 rounded-2xl active-scale cursor-pointer transition-all text-center shadow-sm"
            >
              <div className="w-9 h-9 rounded-full bg-rose-500/10 text-rose-600 flex items-center justify-center mb-1.5 shrink-0">
                <span className="material-symbols-outlined text-[20px]">notes</span>
              </div>
              <span className="font-display font-black text-[10px] text-slate-800 mb-0.5">Word Guess 6</span>
              <span className="text-[7px] text-slate-500 font-bold leading-tight font-medium">6 words chain</span>
            </button>

            {/* Dots & Boxes */}
            <button
              onClick={() => {
                setShowAttachmentMenu(false);
                setShowDotsModal(true);
              }}
              disabled={creatingGame}
              className="flex flex-col items-center justify-center p-3 bg-white/50 hover:bg-white border border-white/80 rounded-2xl active-scale cursor-pointer transition-all text-center shadow-sm"
            >
              <div className="w-9 h-9 rounded-full bg-indigo-500/10 text-indigo-600 flex items-center justify-center mb-1.5 shrink-0">
                <span className="material-symbols-outlined text-[20px]">grid_on</span>
              </div>
              <span className="font-display font-black text-[10px] text-slate-800 mb-0.5">Dots & Boxes</span>
              <span className="text-[7px] text-slate-500 font-bold leading-tight font-medium">Custom grid arena</span>
            </button>
          </div>
        </div>
      )}

      {/* Emoji / Sticker / GIF Sheet */}
      {showEmojiMenu && (
        <div className="absolute bottom-[72px] left-1/2 -translate-x-1/2 w-[92%] bg-white/40 backdrop-blur-xl border border-white/50 rounded-3xl shadow-[0px_-8px_32px_rgba(0,0,0,0.15)] z-20 flex flex-col h-[280px] animate-slide-up overflow-hidden">
          {/* Header tabs */}
          <div className="flex items-center justify-between border-b border-white/40 px-4 py-2 shrink-0">
            <div className="flex space-x-4">
              <button
                type="button"
                onClick={() => setEmojiTab("emojis")}
                className={`text-xs font-black py-1 border-b-2 transition-colors ${
                  emojiTab === "emojis" ? "border-primary text-primary" : "border-transparent text-outline"
                }`}
              >
                Emojis
              </button>
              <button
                type="button"
                onClick={() => setEmojiTab("stickers")}
                className={`text-xs font-black py-1 border-b-2 transition-colors ${
                  emojiTab === "stickers" ? "border-primary text-primary" : "border-transparent text-outline"
                }`}
              >
                Stickers
              </button>
              <button
                type="button"
                onClick={() => setEmojiTab("gifs")}
                className={`text-xs font-black py-1 border-b-2 transition-colors ${
                  emojiTab === "gifs" ? "border-primary text-primary" : "border-transparent text-outline"
                }`}
              >
                GIFs
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowEmojiMenu(false)}
              className="w-7 h-7 rounded-full bg-white/60 hover:bg-white text-outline flex items-center justify-center border border-white/80 active-scale cursor-pointer animate-fade-in"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-3">
            {emojiTab === "emojis" && (
              <div className="grid grid-cols-8 gap-3 justify-items-center">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      setInputText((prev) => prev + emoji);
                    }}
                    className="text-2xl hover:scale-125 transition-transform duration-100 cursor-pointer active-scale"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}

            {emojiTab === "stickers" && (
              <div className="grid grid-cols-3 gap-3">
                {STICKERS.map((sticker) => (
                  <button
                    key={sticker.code}
                    type="button"
                    onClick={() => handleSendSticker(sticker.code)}
                    className={`h-14 rounded-2xl bg-gradient-to-tr ${sticker.gradient} flex items-center justify-center shadow-md hover:scale-105 active-scale transition-all border border-white/20`}
                  >
                    <span className="font-display font-black text-[10px] text-white uppercase tracking-wider">
                      {sticker.label}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {emojiTab === "gifs" && (
              <div className="space-y-3">
                {/* GIF Search bar */}
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3 text-outline text-[16px]">
                    search
                  </span>
                  <input
                    type="text"
                    placeholder="Search Giphy..."
                    value={gifSearchQuery}
                    onChange={(e) => setGifSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-white/60 hover:bg-white focus:bg-white border border-white/80 focus:border-primary rounded-xl text-xs text-on-surface placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all font-medium"
                  />
                </div>

                {gifLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <span className="btn-loader border-primary animate-spin" />
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {gifs.map((gif) => (
                      <button
                        key={gif.id}
                        type="button"
                        onClick={() => handleSendGif(gif.images.fixed_height.url)}
                        className="rounded-xl overflow-hidden h-20 bg-white/40 border border-white/50 active-scale transition-transform cursor-pointer relative group"
                      >
                        <img
                          src={gif.images.fixed_height.url}
                          alt="gif"
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Input panel bar */}
      <footer className="p-3 bg-white/40 backdrop-blur-xl border border-white/50 rounded-2xl mx-4 mb-4 shadow-lg flex items-center space-x-2 shrink-0 relative z-20">
        <button
          type="button"
          onClick={() => {
            setShowAttachmentMenu(!showAttachmentMenu);
            setShowEmojiMenu(false);
          }}
          className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all cursor-pointer active-scale shrink-0 ${
            showAttachmentMenu 
              ? "bg-primary text-white border-primary/20 rotate-45" 
              : "bg-white/60 hover:bg-white text-on-surface-variant hover:text-on-surface border-white/80 shadow-sm"
          }`}
          title="Attach Game Invite"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setShowEmojiMenu(!showEmojiMenu);
            setShowAttachmentMenu(false);
          }}
          className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all cursor-pointer active-scale shrink-0 ${
            showEmojiMenu 
              ? "bg-primary text-white border-primary/20" 
              : "bg-white/60 hover:bg-white text-on-surface-variant hover:text-on-surface border-white/80 shadow-sm"
          }`}
          title="Send Sticker / Emoji / GIF"
        >
          <span className="material-symbols-outlined text-[20px]">sentiment_satisfied</span>
        </button>

        <form onSubmit={handleSendMessage} className="flex-1 flex items-center space-x-2 min-w-0">
          <input
            type="text"
            placeholder="Type a message..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onFocus={() => {
              // Wait for mobile keyboard to slide up and resize viewport
              setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
              }, 300);
            }}
            disabled={sending || creatingGame}
            className="flex-1 bg-white/60 hover:bg-white text-sm text-on-surface placeholder-slate-400 border border-white/85 focus:border-primary focus:bg-white rounded-full px-4 py-2 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all min-w-0 font-medium"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || sending}
            className="w-9 h-9 rounded-full bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-high hover:to-indigo-700 text-white flex items-center justify-center active-scale transition-all border border-primary/20 disabled:opacity-50 disabled:scale-100 cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]">send</span>
          </button>
        </form>
      </footer>

      {/* Game Stats Drawer Overlay */}
      {showStatsPanel && (
        <div 
          onClick={() => setShowStatsPanel(false)}
          className="absolute inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity duration-300"
        />
      )}
      <div 
        className={`absolute inset-0 h-full w-full bg-surface-container-lowest shadow-2xl z-50 transform transition-transform duration-300 ease-out flex flex-col ${
          showStatsPanel ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drawer Header */}
        <div className="p-4 border-b border-outline-variant/20 flex justify-between items-center bg-surface-container-low shrink-0">
          <div className="flex items-center space-x-2">
            <span className="material-symbols-outlined text-primary">analytics</span>
            <h4 className="font-display font-black text-sm text-on-surface">Stats vs {friend?.name || friend?.email.split("@")[0]}</h4>
          </div>
          <button 
            onClick={() => setShowStatsPanel(false)}
            className="w-7 h-7 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer active-scale"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {statsLoading ? (
            <div className="flex flex-col items-center justify-center h-48 space-y-2">
              <div className="w-8 h-8 rounded-full border-4 border-primary/30 border-t-primary animate-spin"></div>
              <p className="text-xs text-outline font-bold">Loading match stats...</p>
            </div>
          ) : (
            <>
              {/* Overall Record Card */}
              <div className="bg-gradient-to-tr from-primary/10 to-secondary/10 border border-primary/20 rounded-2xl p-4 shadow-sm relative overflow-hidden">
                <div className="absolute top-[-10px] right-[-10px] opacity-10">
                  <span className="material-symbols-outlined text-[64px] text-primary">military_tech</span>
                </div>
                <div className="relative">
                  <span className="bg-primary/20 text-primary text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">Overall Record</span>
                  <div className="flex justify-between items-center mt-3">
                    <div>
                      <h4 className="font-display font-black text-2xl text-on-surface">{overallWins}W - {overallLosses}L</h4>
                      <p className="text-[10px] text-outline font-semibold mt-1">Played: {overallTotal} | Draws: {overallDraws}</p>
                    </div>
                    <div className="w-14 h-14 rounded-full border-4 border-primary-container flex flex-col items-center justify-center bg-surface-container shadow-inner">
                      <span className="font-display font-black text-sm text-primary">{overallWinRate}%</span>
                      <span className="text-[7px] text-outline font-black uppercase">Win Rate</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Game-wise Stats */}
              <div className="space-y-3">
                <h5 className="font-display font-extrabold text-[10px] text-outline uppercase tracking-wider">Game-wise breakdown</h5>
                
                {/* Game 1: Battleship */}
                <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-3.5 flex flex-col gap-2.5">
                  <div className="text-center font-display font-black text-xs text-indigo-600 uppercase tracking-widest pb-1.5 border-b border-outline-variant/10 flex items-center justify-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">target</span>
                    Grid Battleship
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <div className="w-[42%] text-left flex items-center gap-1 overflow-hidden shrink-0">
                      <span className="font-bold text-on-surface truncate">You</span>
                      <span className="text-[10px] text-outline font-extrabold shrink-0">({battleStats.wins})</span>
                    </div>
                    <div className="w-[16%] text-center font-display font-black text-xs text-primary shrink-0">
                      {battleStats.winRate}%
                    </div>
                    <div className="w-[42%] text-right flex items-center justify-end gap-1 overflow-hidden shrink-0">
                      <span className="text-[10px] text-outline font-extrabold shrink-0">({battleStats.losses})</span>
                      <span className="font-bold text-on-surface truncate">{friend?.name || friend?.email.split("@")[0]}</span>
                    </div>
                  </div>
                </div>

                {/* Game 2: Memory */}
                <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-3.5 flex flex-col gap-2.5">
                  <div className="text-center font-display font-black text-xs text-fuchsia-600 uppercase tracking-widest pb-1.5 border-b border-outline-variant/10 flex items-center justify-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">extension</span>
                    Memory Match
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <div className="w-[42%] text-left flex items-center gap-1 overflow-hidden shrink-0">
                      <span className="font-bold text-on-surface truncate">You</span>
                      <span className="text-[10px] text-outline font-extrabold shrink-0">({memoryStats.wins})</span>
                    </div>
                    <div className="w-[16%] text-center font-display font-black text-xs text-primary shrink-0">
                      {memoryStats.winRate}%
                    </div>
                    <div className="w-[42%] text-right flex items-center justify-end gap-1 overflow-hidden shrink-0">
                      <span className="text-[10px] text-outline font-extrabold shrink-0">({memoryStats.losses})</span>
                      <span className="font-bold text-on-surface truncate">{friend?.name || friend?.email.split("@")[0]}</span>
                    </div>
                  </div>
                </div>

                {/* Game 3: Tic Tac Toe */}
                <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-3.5 flex flex-col gap-2.5">
                  <div className="text-center font-display font-black text-xs text-amber-600 uppercase tracking-widest pb-1.5 border-b border-outline-variant/10 flex items-center justify-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">grid_3x3</span>
                    Tic Tac Toe
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <div className="w-[42%] text-left flex items-center gap-1 overflow-hidden shrink-0">
                      <span className="font-bold text-on-surface truncate">You</span>
                      <span className="text-[10px] text-outline font-extrabold shrink-0">({tictactoeStats.wins})</span>
                    </div>
                    <div className="w-[16%] text-center font-display font-black text-xs text-primary shrink-0">
                      {tictactoeStats.winRate}%
                    </div>
                    <div className="w-[42%] text-right flex items-center justify-end gap-1 overflow-hidden shrink-0">
                      <span className="text-[10px] text-outline font-extrabold shrink-0">({tictactoeStats.losses})</span>
                      <span className="font-bold text-on-surface truncate">{friend?.name || friend?.email.split("@")[0]}</span>
                    </div>
                  </div>
                </div>

                {/* Game 4: Word Guess */}
                <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-3.5 flex flex-col gap-2.5">
                  <div className="text-center font-display font-black text-xs text-emerald-600 uppercase tracking-widest pb-1.5 border-b border-outline-variant/10 flex items-center justify-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">notes</span>
                    Word Guess
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <div className="w-[42%] text-left flex items-center gap-1 overflow-hidden shrink-0">
                      <span className="font-bold text-on-surface truncate">You</span>
                      <span className="text-[10px] text-outline font-extrabold shrink-0">({wordGuessStats.wins})</span>
                    </div>
                    <div className="w-[16%] text-center font-display font-black text-xs text-primary shrink-0">
                      {wordGuessStats.winRate}%
                    </div>
                    <div className="w-[42%] text-right flex items-center justify-end gap-1 overflow-hidden shrink-0">
                      <span className="text-[10px] text-outline font-extrabold shrink-0">({wordGuessStats.losses})</span>
                      <span className="font-bold text-on-surface truncate">{friend?.name || friend?.email.split("@")[0]}</span>
                    </div>
                  </div>
                </div>

                {/* Game 5: Dots & Boxes */}
                <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-3.5 flex flex-col gap-2.5">
                  <div className="text-center font-display font-black text-xs text-indigo-600 uppercase tracking-widest pb-1.5 border-b border-outline-variant/10 flex items-center justify-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">grid_on</span>
                    Dots & Boxes
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <div className="w-[42%] text-left flex items-center gap-1 overflow-hidden shrink-0">
                      <span className="font-bold text-on-surface truncate">You</span>
                      <span className="text-[10px] text-outline font-extrabold shrink-0">({dotsStats.wins})</span>
                    </div>
                    <div className="w-[16%] text-center font-display font-black text-xs text-primary shrink-0">
                      {dotsStats.winRate}%
                    </div>
                    <div className="w-[42%] text-right flex items-center justify-end gap-1 overflow-hidden shrink-0">
                      <span className="text-[10px] text-outline font-extrabold shrink-0">({dotsStats.losses})</span>
                      <span className="font-bold text-on-surface truncate">{friend?.name || friend?.email.split("@")[0]}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Games List */}
              <div className="space-y-3 pt-2">
                <h5 className="font-display font-extrabold text-[10px] text-outline uppercase tracking-wider">Recent Matches</h5>
                {completedGamesWithFriend.length === 0 ? (
                  <div className="text-center py-4 bg-surface-container-low/50 border border-outline-variant/20 border-dashed rounded-xl text-[11px] text-outline font-bold">
                    No games completed yet. Challenge them!
                  </div>
                ) : (
                  <div className="space-y-2">
                    {completedGamesWithFriend.slice(0, 5).map((game) => {
                      const isWinner = game.winnerId === user.id;
                      const isDraw = !game.winnerId;
                      
                      return (
                        <div key={game.id} className="flex justify-between items-center p-2.5 bg-surface-container-low border border-outline-variant/20 rounded-xl">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[16px] text-outline">
                              {game.mode === "MEMORY" ? "extension" : (game.mode === "TICTACTOE" ? "grid_3x3" : (game.mode === "WORD_GUESS" ? "notes" : (game.mode === "DOTS" ? "grid_on" : "grid_view")))}
                            </span>
                            <div className="flex flex-col">
                              <span className="font-bold text-[11px] text-on-surface leading-tight">
                                {game.mode === "MEMORY" ? "Memory Match" : (game.mode === "TICTACTOE" ? "Tic Tac Toe" : (game.mode === "WORD_GUESS" ? "Word Guess" : (game.mode === "DOTS" ? "Dots & Boxes" : "Grid Battleship")))}
                              </span>
                              <span className="text-[8px] text-outline mt-0.5">{new Date(game.updatedAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                          
                          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                            isDraw 
                              ? "bg-slate-100 text-slate-700" 
                              : (isWinner ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100")
                          }`}>
                            {isDraw ? "Draw" : (isWinner ? "Victory" : "Defeat")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Dots & Boxes Configuration Modal */}
      {showDotsModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white/90 backdrop-blur-xl border border-white/60 w-full max-w-[280px] rounded-3xl p-5 shadow-2xl animate-scale-up text-on-surface">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 border border-indigo-200/50 text-indigo-700 flex items-center justify-center">
                <span className="material-symbols-outlined text-[20px]">grid_on</span>
              </div>
              <div>
                <h4 className="font-display font-black text-xs text-slate-800">Dots & Boxes Setup</h4>
                <p className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">Choose Grid Size (max 10x10)</p>
              </div>
            </div>

            <div className="space-y-3.5 my-4">
              {/* Rows Input */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-wide">Grid Height (Boxes)</label>
                <div className="flex items-center gap-2">
                  <button 
                    type="button"
                    onClick={() => setDotsRowsInput(r => Math.max(2, r - 1))}
                    className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold flex items-center justify-center border border-slate-200 cursor-pointer active-scale"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="2"
                    max="10"
                    value={dotsRowsInput}
                    onChange={(e) => setDotsRowsInput(Math.min(10, Math.max(2, parseInt(e.target.value) || 4)))}
                    className="flex-1 text-center bg-white border border-slate-200 rounded-lg py-0.5 text-xs font-black text-slate-800 focus:outline-none focus:border-primary"
                  />
                  <button 
                    type="button"
                    onClick={() => setDotsRowsInput(r => Math.min(10, r + 1))}
                    className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold flex items-center justify-center border border-slate-200 cursor-pointer active-scale"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Columns Input */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-wide">Grid Width (Boxes)</label>
                <div className="flex items-center gap-2">
                  <button 
                    type="button"
                    onClick={() => setDotsColsInput(c => Math.max(2, c - 1))}
                    className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold flex items-center justify-center border border-slate-200 cursor-pointer active-scale"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="2"
                    max="10"
                    value={dotsColsInput}
                    onChange={(e) => setDotsColsInput(Math.min(10, Math.max(2, parseInt(e.target.value) || 4)))}
                    className="flex-1 text-center bg-white border border-slate-200 rounded-lg py-0.5 text-xs font-black text-slate-800 focus:outline-none focus:border-primary"
                  />
                  <button 
                    type="button"
                    onClick={() => setDotsColsInput(c => Math.min(10, c + 1))}
                    className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold flex items-center justify-center border border-slate-200 cursor-pointer active-scale"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-4 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDotsModal(false)}
                className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black rounded-xl active-scale transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleSendGameInvite("DOTS", 5, dotsRowsInput, dotsColsInput);
                  setShowDotsModal(false);
                }}
                className="flex-1 py-1.5 bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-high hover:to-indigo-700 text-white text-[10px] font-black rounded-xl shadow-md active-scale transition-all cursor-pointer"
              >
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
