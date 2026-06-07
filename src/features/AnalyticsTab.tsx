import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { BarChart2, Send, Bot, User } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  ts: Date
}

const SUGGESTIONS = [
  'Who was absent most this month?',
  'Total payroll for this month',
  'Attendance % for each person this month',
  'Who arrived late this week?',
]

// API is proxied by nginx at /api -> api container :3001
const API_URL = '/api/analytics'

export default function AnalyticsTab() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(question: string) {
    const q = question.trim()
    if (!q || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: q, ts: new Date() }])
    setLoading(true)

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      const data = (await res.json()) as { answer?: string; error?: string }
      const text = data.answer ?? data.error ?? 'No response from server.'
      setMessages(prev => [...prev, { role: 'assistant', content: text, ts: new Date() }])
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Could not reach the analytics API. Make sure the server is running and nginx is proxying /api correctly.',
          ts: new Date(),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-col" style={{ minHeight: '65vh' }}>
        <CardHeader className="pb-3 flex-shrink-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart2 className="h-4 w-4" />
            AI Analytics Chat
          </CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col gap-3 flex-1 overflow-hidden px-4 pb-4 pt-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 min-h-0 pr-1">
            {messages.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-full gap-5 py-8 text-center">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <Bot className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-sm">Ask about attendance &amp; salary</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Gemini queries the database and answers in plain language
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`h-7 w-7 flex-shrink-0 rounded-full flex items-center justify-center ${
                    m.role === 'user' ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  {m.role === 'user' ? (
                    <User className="h-3.5 w-3.5 text-primary-foreground" />
                  ) : (
                    <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
                <div
                  className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-sm'
                      : 'bg-muted text-foreground rounded-tl-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  <p className={`text-xs mt-1 ${m.role === 'user' ? 'opacity-70' : 'text-muted-foreground'}`}>
                    {m.ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2">
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="bg-muted rounded-xl rounded-tl-sm px-3 py-3">
                  <div className="flex gap-1 items-center">
                    <span className="h-2 w-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="h-2 w-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="h-2 w-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2 flex-shrink-0">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask anything… (Shift+Enter for new line)"
              className="resize-none min-h-[60px]"
              rows={2}
              disabled={loading}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage(input)
                }
              }}
            />
            <Button
              size="icon"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="self-end h-9 w-9 flex-shrink-0"
            >
              <Send className="h-4 w-4" />
              <span className="sr-only">Send</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
