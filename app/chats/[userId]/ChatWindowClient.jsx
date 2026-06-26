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

  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const isInitialLoad = useRef(true);

  const [showEmojiMenu, setShowEmojiMenu] = useState(false);
  const [emojiTab, setEmojiTab] = useState("emojis"); // "emojis" | "stickers" | "gifs"
  const [gifSearchQuery, setGifSearchQuery] = useState("");
  const [gifs, setGifs] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);

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
      } catch (err) {
        console.error("Error initializing chat window:", err);
      } finally {
        setLoading(false);
      }
    }
    initChat();
  }, [recipientId]);

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
    activeSocket.on("direct-message-received", handleMessageReceived);
    activeSocket.on("friend-status-changed", handleFriendStatusChanged);

    return () => {
      window.removeEventListener("global-direct-message-received", handleGlobalEvent);
      activeSocket.off("direct-message-received", handleMessageReceived);
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

  const handleSendGameInvite = async (mode) => {
    if (creatingGame) return;
    setCreatingGame(true);
    setShowAttachmentMenu(false);

    try {
      // 1. Create a game invitation via API
      const gameRes = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiverId: recipientId, mode }),
      });

      if (!gameRes.ok) throw new Error("Failed to create game");
      const gameData = await gameRes.json();

      // 2. Save it as a Direct Message in database
      const inviteText = mode === "MEMORY" 
        ? "Challenged you to play Emoji Memory Match! 🧩"
        : "Challenged you to play 1v1 Grid Battleship! 🎯";

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

  return (
    <div className="h-[100dvh] flex flex-col bg-background w-full max-w-md md:max-w-lg lg:max-w-xl mx-auto relative border-x border-outline-variant/10 shadow-2xl overflow-hidden">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-surface-container-lowest/80 backdrop-blur-xl border-b border-outline-variant/20 px-4 py-3 flex items-center space-x-3">
        <button
          onClick={() => router.push("/chats")}
          className="w-8 h-8 rounded-full bg-surface-container/50 flex items-center justify-center text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>

        {friend ? (
          <>
            <div className="relative shrink-0">
              <div className={`w-9 h-9 rounded-full bg-gradient-to-tr ${getAvatarGradient(friend.id)} flex items-center justify-center text-white font-extrabold text-xs shadow-md`}>
                {getInitials(friend.name, friend.email)}
              </div>
              {friend.isOnline && (
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-success border-2 border-background rounded-full shadow-sm"></span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-bold text-sm text-on-surface truncate leading-tight">
                {friend.name || friend.email.split("@")[0]}
              </h3>
              <p className="text-[10px] text-outline leading-none mt-0.5">
                {friend.isOnline ? "Online" : "Offline"}
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 min-w-0 animate-pulse flex items-center space-x-2">
            <div className="w-9 h-9 bg-surface-container rounded-full"></div>
            <div className="space-y-1">
              <div className="h-3 bg-surface-container rounded w-24"></div>
              <div className="h-2 bg-surface-container rounded w-12"></div>
            </div>
          </div>
        )}

        <button 
          onClick={() => handleSendGameInvite("BATTLE")}
          disabled={creatingGame}
          className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors cursor-pointer active-scale"
          title="Quick Invite to Battle"
        >
          <span className="material-symbols-outlined text-[18px]">sports_esports</span>
        </button>
      </header>

      {/* Message Window Area */}
      <main ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-surface-container/10 relative">
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
              return (
                <div key={message.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className="w-64 bg-gradient-to-tr from-surface-container-lowest to-surface-container border border-outline-variant/30 rounded-2xl p-4 shadow-md relative overflow-hidden group">
                    {/* Mode logo overlay */}
                    <div className="absolute -top-3 -right-3 text-on-surface/5 group-hover:scale-110 transition-transform">
                      <span className="material-symbols-outlined text-[64px]">
                        {inviteMode === "MEMORY" ? "extension" : "grid_view"}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2.5 mb-2 relative">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                        <span className="material-symbols-outlined text-[20px]">
                          {inviteMode === "MEMORY" ? "extension" : "grid_view"}
                        </span>
                      </div>
                      <div>
                        <h5 className="font-display font-extrabold text-xs text-on-surface">
                          {inviteMode === "MEMORY" ? "Memory Match Challenge 🧩" : "Battle Grid Challenge 🎮"}
                        </h5>
                        <p className="text-[9px] text-outline uppercase tracking-wider font-semibold">1v1 Mode</p>
                      </div>
                    </div>

                    <p className="text-xs text-on-surface-variant mb-4 pr-6 leading-relaxed">
                      {isMe ? "You challenged them to a match!" : "Challenged you to a match!"}
                    </p>

                    <div className="flex items-center justify-between">
                      <a
                        href={`/game/${message.inviteGameId}`}
                        className="px-3.5 py-1.5 bg-primary text-white text-xs font-bold rounded-xl active-scale transition-transform cursor-pointer inline-flex items-center"
                      >
                        Join Match
                        <span className="material-symbols-outlined text-[14px] ml-1">play_arrow</span>
                      </a>
                      <span className="text-[9px] text-outline">{timeStr}</span>
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
                  className={`max-w-[75%] px-4 py-2.5 rounded-2xl shadow-sm relative ${
                    isMe
                      ? "bg-primary text-white rounded-tr-none"
                      : "bg-surface-container-lowest text-on-surface border border-outline-variant/10 rounded-tl-none"
                  }`}
                >
                  <p className="text-xs leading-relaxed break-words">{message.content}</p>
                  <span className={`text-[8px] block text-right mt-1.5 select-none ${isMe ? "text-white/60" : "text-outline"}`}>
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
        <div className="absolute bottom-[64px] left-0 w-full bg-surface-container-lowest border-t border-outline-variant/20 rounded-t-3xl shadow-[0px_-8px_24px_rgba(0,0,0,0.15)] z-20 p-5 transition-all duration-300 animate-slide-up">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-display font-extrabold text-sm text-on-surface">Choose Game Mode</h4>
            <button
              onClick={() => setShowAttachmentMenu(false)}
              className="w-7 h-7 rounded-full bg-surface-container flex items-center justify-center text-outline cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {/* Battle Grid */}
            <button
              onClick={() => handleSendGameInvite("BATTLE")}
              disabled={creatingGame}
              className="flex flex-col items-center justify-center p-4 bg-surface-container rounded-2xl hover:bg-primary/5 active-scale cursor-pointer transition-all border border-outline-variant/10 text-center"
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-[28px]">grid_view</span>
              </div>
              <span className="font-display font-extrabold text-xs text-on-surface mb-0.5">Battle Grid</span>
              <span className="text-[9px] text-outline leading-tight">8x8 Grid Arena</span>
            </button>

            {/* Memory Match */}
            <button
              onClick={() => handleSendGameInvite("MEMORY")}
              disabled={creatingGame}
              className="flex flex-col items-center justify-center p-4 bg-surface-container rounded-2xl hover:bg-secondary/5 active-scale cursor-pointer transition-all border border-outline-variant/10 text-center"
            >
              <div className="w-12 h-12 rounded-full bg-secondary/10 text-secondary flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-[28px]">extension</span>
              </div>
              <span className="font-display font-extrabold text-xs text-on-surface mb-0.5">Memory Match</span>
              <span className="text-[9px] text-outline leading-tight">Emoji card pairing</span>
            </button>
          </div>
        </div>
      )}

      {/* Emoji / Sticker / GIF Sheet */}
      {showEmojiMenu && (
        <div className="absolute bottom-[64px] left-0 w-full bg-surface-container-lowest border-t border-outline-variant/20 rounded-t-3xl shadow-[0px_-8px_24px_rgba(0,0,0,0.15)] z-20 flex flex-col h-[280px] animate-slide-up">
          {/* Header tabs */}
          <div className="flex items-center justify-between border-b border-outline-variant/20 px-4 py-2 shrink-0">
            <div className="flex space-x-4">
              <button
                type="button"
                onClick={() => setEmojiTab("emojis")}
                className={`text-xs font-bold py-1 border-b-2 transition-colors ${
                  emojiTab === "emojis" ? "border-primary text-primary" : "border-transparent text-outline"
                }`}
              >
                Emojis
              </button>
              <button
                type="button"
                onClick={() => setEmojiTab("stickers")}
                className={`text-xs font-bold py-1 border-b-2 transition-colors ${
                  emojiTab === "stickers" ? "border-primary text-primary" : "border-transparent text-outline"
                }`}
              >
                Stickers
              </button>
              <button
                type="button"
                onClick={() => setEmojiTab("gifs")}
                className={`text-xs font-bold py-1 border-b-2 transition-colors ${
                  emojiTab === "gifs" ? "border-primary text-primary" : "border-transparent text-outline"
                }`}
              >
                GIFs
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowEmojiMenu(false)}
              className="w-7 h-7 rounded-full bg-surface-container flex items-center justify-center text-outline cursor-pointer"
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
                    className={`h-16 rounded-xl bg-gradient-to-tr ${sticker.gradient} flex items-center justify-center shadow-sm hover:scale-105 active-scale transition-all border border-white/10`}
                  >
                    <span className="font-display font-black text-xs text-white uppercase tracking-wider">
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
                    className="w-full pl-9 pr-3 py-1.5 bg-surface-container rounded-xl border-none text-xs text-on-surface placeholder-outline focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
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
                        className="rounded-lg overflow-hidden h-20 bg-surface-container active-scale transition-transform cursor-pointer relative group border border-outline-variant/10"
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
      <footer className="p-3 bg-surface-container-lowest border-t border-outline-variant/20 flex items-center space-x-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            setShowAttachmentMenu(!showAttachmentMenu);
            setShowEmojiMenu(false);
          }}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
            showAttachmentMenu ? "bg-primary text-white rotate-45" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
          }`}
          title="Attach Game Invite"
        >
          <span className="material-symbols-outlined text-[22px]">add</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setShowEmojiMenu(!showEmojiMenu);
            setShowAttachmentMenu(false);
          }}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
            showEmojiMenu ? "bg-primary text-white" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
          }`}
          title="Send Sticker / Emoji / GIF"
        >
          <span className="material-symbols-outlined text-[22px]">sentiment_satisfied</span>
        </button>

        <form onSubmit={handleSendMessage} className="flex-1 flex items-center space-x-2">
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
            className="flex-1 bg-surface-container rounded-full px-4 py-2 text-sm text-on-surface placeholder-outline border-none focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || sending}
            className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary-high active-scale transition-all disabled:opacity-50 disabled:scale-100 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">send</span>
          </button>
        </form>
      </footer>
    </div>
  );
}
