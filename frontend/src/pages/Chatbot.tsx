import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Loader } from "lucide-react";
import { api } from "../api/client";

interface Message {
  type: "user" | "bot";
  content: string;
  data?: Record<string, unknown>;
  timestamp: Date;
}

interface ChatResponse {
  message: string;
  intent: string;
  data?: Record<string, unknown>;
}

/** Format time HH:mm */
function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function Chatbot() {
  const [messages, setMessages] = useState<Message[]>([
    {
      type: "bot",
      content:
        "Halo! Saya adalah chatbot parkir Anda. Saya dapat membantu Anda dengan informasi tentang tarif parkir, pelanggaran yang dilaporkan, dan lokasi area parkir. Apa yang bisa saya bantu?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll ke pesan terbaru
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    // Add user message
    const userMessage: Message = {
      type: "user",
      content: input,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await api.post<{ success: boolean; data: ChatResponse }>("/chat/query", {
        message: input,
      });

      if (response.data.success) {
        const { message, data } = response.data.data;
        const botMessage: Message = {
          type: "bot",
          content: message,
          data,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, botMessage]);
      }
    } catch (error) {
      const errorMessage: Message = {
        type: "bot",
        content: "Maaf, terjadi kesalahan saat memproses pertanyaan Anda. Silakan coba lagi.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      console.error("Chat error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <MessageCircle size={24} />
        Chat Bot Parkir
      </div>

      <div
        className="card"
        style={{
          height: "70vh",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          overflow: "hidden",
        }}
      >
        {/* Messages Area */}
        <div
          className="chat-messages"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            backgroundColor: "var(--lms-bg-body)",
          }}
        >
          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                justifyContent: msg.type === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  maxWidth: "70%",
                  backgroundColor:
                    msg.type === "user" ? "var(--lms-primary)" : "var(--lms-bg-card)",
                  color: msg.type === "user" ? "white" : "var(--lms-text-primary)",
                  padding: "12px 16px",
                  borderRadius:
                    msg.type === "user"
                      ? "16px 16px 4px 16px" // WhatsApp right bubble
                      : "16px 16px 16px 4px", // WhatsApp left bubble
                  border: msg.type === "bot" ? "1px solid var(--lms-border)" : "none",
                  boxShadow: "var(--lms-shadow-sm)",
                  lineHeight: "1.5",
                  wordWrap: "break-word",
                }}
              >
                {/* Render message content with markdown-like formatting */}
                <div style={{ whiteSpace: "pre-wrap", marginBottom: "8px" }}>
                  {msg.content.split("\n").map((line, i) => (
                    <div key={i}>
                      {line.split(/(\*\*.*?\*\*)/g).map((part, j) => {
                        if (part.startsWith("**") && part.endsWith("**")) {
                          return (
                            <strong key={j}>{part.slice(2, -2)}</strong>
                          );
                        }
                        return <span key={j}>{part}</span>;
                      })}
                    </div>
                  ))}
                </div>

                {/* Data Visualization */}
                {msg.data && msg.type === "bot" && (
                  <div
                    style={{
                      marginTop: "12px",
                      fontSize: "0.9em",
                      paddingTop: "8px",
                      borderTop:
                        msg.type === "bot"
                          ? "1px solid rgba(0, 0, 0, 0.1)"
                          : "1px solid rgba(255, 255, 255, 0.1)",
                    }}
                  >
                    {/* Tarif Breakdown */}
                    {(msg.data as any).totalAmount && (
                      <div style={{ marginBottom: "8px" }}>
                        <strong>Rincian:</strong>
                        {(msg.data as any).areaBreakdown && (
                          <ul style={{ marginTop: "6px", paddingLeft: "16px", margin: "6px 0 0 16px" }}>
                            {Object.entries(
                              (msg.data as any).areaBreakdown as Record<string, any>
                            ).map(([area, stats]: [string, any]) => (
                              <li key={area} style={{ fontSize: "0.85em" }}>
                                {area}: {stats.count} transaksi (Rp{" "}
                                {stats.total.toLocaleString("id-ID")})
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {/* Violations Breakdown */}
                    {(msg.data as any).totalViolations !== undefined && (
                      <div>
                        <strong>Breakdown Pelanggaran:</strong>
                        {(msg.data as any).typeBreakdown && (
                          <ul style={{ marginTop: "6px", paddingLeft: "16px", margin: "6px 0 0 16px" }}>
                            {Object.entries(
                              (msg.data as any).typeBreakdown as Record<string, any>
                            ).map(([type, count]: [string, any]) => (
                              <li key={type} style={{ fontSize: "0.85em" }}>
                                {type}: {count}
                              </li>
                            ))}
                          </ul>
                        )}
                        {(msg.data as any).areaBreakdown && (
                          <div style={{ marginTop: "8px" }}>
                            <strong>Per Area:</strong>
                            <ul style={{ marginTop: "6px", paddingLeft: "16px", margin: "6px 0 0 16px" }}>
                              {Object.entries(
                                (msg.data as any).areaBreakdown as Record<string, any>
                              ).map(([area, count]: [string, any]) => (
                                <li key={area} style={{ fontSize: "0.85em" }}>
                                  {area}: {count}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Areas List */}
                    {(msg.data as any).totalAreas && (
                      <div>
                        <strong>Area Tersedia:</strong>
                        {(msg.data as any).areas && Array.isArray((msg.data as any).areas) && (
                          <ul
                            style={{
                              marginTop: "6px",
                              paddingLeft: "16px",
                              margin: "6px 0 0 16px",
                              fontSize: "0.85em",
                            }}
                          >
                            {((msg.data as any).areas as Array<any>)
                              .slice(0, 5)
                              .map((area: any) => (
                                <li key={area.id}>
                                  {area.name} ({area.location}) - Kapasitas: {area.capacity}
                                </li>
                              ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Timestamp */}
                <div
                  style={{
                    fontSize: "0.7rem",
                    marginTop: "4px",
                    opacity: msg.type === "user" ? 0.7 : 0.6,
                    textAlign: "right",
                    color: msg.type === "user" ? "inherit" : "var(--lms-text-muted)",
                  }}
                >
                  {formatTime(msg.timestamp)}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px 16px",
                  borderRadius: "16px 16px 16px 4px",
                  backgroundColor: "var(--lms-bg-card)",
                  border: "1px solid var(--lms-border)",
                  color: "var(--lms-text-secondary)",
                }}
              >
                <Loader size={16} className="spin" />
                <span>Sedang memproses...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            padding: "12px 16px",
            backgroundColor: "var(--lms-bg-card)",
            borderTop: "1px solid var(--lms-border)",
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Tanya tentang tarif parkir, pelanggaran, atau area parkir..."
            disabled={loading}
            className="input"
            style={{
              flex: 1,
              padding: "10px 12px",
              border: "1px solid var(--lms-border)",
              borderRadius: "8px",
              fontSize: "0.95em",
            }}
          />
          <button
            onClick={handleSendMessage}
            disabled={loading || !input.trim()}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "10px 16px",
              backgroundColor: input.trim() ? "var(--lms-primary)" : "var(--lms-border)",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: input.trim() ? "pointer" : "not-allowed",
              fontSize: "0.95em",
              fontWeight: "500",
              transition: "background 0.2s ease",
            }}
            title="Kirim pesan"
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      <style>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        
        /* Mobile responsiveness */
        @media (max-width: 768px) {
          .chat-messages {
            padding: 12px !important;
          }
          .page-header {
            flex-wrap: wrap;
          }
          div[style*="maxWidth: \"70%\""] {
            maxWidth: 85% !important;
          }
        }
      `}</style>
    </div>
  );
}
