'use client'

import { useState, useEffect } from 'react'
import { getGroups, getMessages } from '@/lib/api'

interface Group {
  id: string
  name: string
  is_monitored: boolean
  message_count_today: number
  last_message_at: string | null
}

interface Message {
  id: string
  sender_name: string | null
  sender_wa_id: string | null
  content: string | null
  sent_at: string
  urgency_score: number
  is_mention: boolean
  media_type: string
  keyword_matched: string[] | null
  group_name: string | null
  chat_name: string | null
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()

  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return time
  if (isYesterday) return `ontem ${time}`
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${time}`
}

export default function MessagesPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [minUrgency, setMinUrgency] = useState<number>(0)
  const [onlyMentions, setOnlyMentions] = useState(false)
  const [mobileView, setMobileView] = useState<'list' | 'messages'>('list')

  useEffect(() => {
    async function load() {
      setLoadingGroups(true)
      try {
        const data = await getGroups()
        const monitored = Array.isArray(data) ? data.filter((g: Group) => g.is_monitored) : []
        setGroups(monitored)
        if (monitored.length > 0) {
          setSelectedGroup(monitored[0])
        }
      } catch {
        // ignore
      } finally {
        setLoadingGroups(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (!selectedGroup) return
    async function loadMessages() {
      setLoadingMessages(true)
      try {
        const data = await getMessages({
          groupId: selectedGroup!.id,
          limit: 100,
          minUrgency: minUrgency > 0 ? minUrgency : undefined,
          onlyMentions: onlyMentions || undefined,
        })
        setMessages(Array.isArray(data) ? data : [])
      } catch {
        setMessages([])
      } finally {
        setLoadingMessages(false)
      }
    }
    loadMessages()
  }, [selectedGroup, minUrgency, onlyMentions])

  function handleSelectGroup(g: Group) {
    setSelectedGroup(g)
    setMobileView('messages')
  }

  if (loadingGroups) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-10 h-10 border-2 border-[#4ff07f] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="h-screen flex">
      {/* Sidebar with groups */}
      <aside
        className={`${
          mobileView === 'list' ? 'flex' : 'hidden'
        } md:flex flex-col w-full md:w-80 bg-[#131b2e] border-r border-[#3c4a3d]/15 flex-shrink-0`}
      >
        <div className="p-5 border-b border-[#3c4a3d]/15">
          <h1 className="text-lg font-bold text-[#dae2fd]">Mensagens</h1>
          <p className="text-xs text-[#bbcbb9] mt-1">
            {groups.length} grupo{groups.length !== 1 ? 's' : ''} monitorado
            {groups.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {groups.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-[#bbcbb9] mb-3">
                Nenhum grupo monitorado ainda.
              </p>
              <a
                href="/groups"
                className="text-xs text-[#4ff07f] hover:underline"
              >
                Configurar grupos
              </a>
            </div>
          ) : (
            groups.map((g) => (
              <button
                key={g.id}
                onClick={() => handleSelectGroup(g)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors mb-1 ${
                  selectedGroup?.id === g.id
                    ? 'bg-[#2d3449]'
                    : 'hover:bg-[#2d3449]/50'
                }`}
              >
                <div className="w-10 h-10 rounded-lg bg-[#2d3449] flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[#bbcbb9] text-[18px]">
                    groups
                  </span>
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium text-[#dae2fd] truncate">
                    {g.name || 'Sem nome'}
                  </p>
                  <p className="text-[11px] text-[#bbcbb9]">
                    {g.message_count_today} msgs hoje
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Main area with messages */}
      <main
        className={`${
          mobileView === 'messages' ? 'flex' : 'hidden'
        } md:flex flex-1 flex-col overflow-hidden`}
      >
        {!selectedGroup ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-[#131b2e] flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-[#bbcbb9] text-[28px]">
                  chat
                </span>
              </div>
              <p className="text-sm text-[#bbcbb9]">
                Selecione um grupo para ver as mensagens
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-5 border-b border-[#3c4a3d]/15 bg-[#0b1326]">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMobileView('list')}
                  className="md:hidden text-[#bbcbb9]"
                >
                  <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <div className="w-10 h-10 rounded-lg bg-[#2d3449] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#bbcbb9]">groups</span>
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#dae2fd]">{selectedGroup.name}</h2>
                  <p className="text-xs text-[#bbcbb9]">
                    {messages.length} mensagem{messages.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {/* Filters */}
              <div className="flex gap-2 mt-4 flex-wrap">
                <select
                  value={minUrgency}
                  onChange={(e) => setMinUrgency(Number(e.target.value))}
                  className="bg-[#131b2e] border border-[#3c4a3d]/20 rounded-lg px-3 py-1.5 text-xs text-[#dae2fd] focus:outline-none focus:border-[#4ff07f]/40"
                >
                  <option value="0">Todas as urgências</option>
                  <option value="4">Urgência 4+</option>
                  <option value="5">Urgência 5</option>
                </select>
                <button
                  onClick={() => setOnlyMentions(!onlyMentions)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    onlyMentions
                      ? 'bg-[#4ff07f] text-[#0b1326]'
                      : 'bg-[#131b2e] text-[#bbcbb9] hover:text-[#dae2fd]'
                  }`}
                >
                  Só menções
                </button>
              </div>
            </div>

            {/* Messages list */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {loadingMessages ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-8 h-8 border-2 border-[#4ff07f] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-[#131b2e] flex items-center justify-center mx-auto mb-4">
                    <span className="material-symbols-outlined text-[#bbcbb9] text-[28px]">
                      inbox
                    </span>
                  </div>
                  <p className="text-sm text-[#dae2fd] font-semibold mb-2">
                    Nenhuma mensagem capturada neste grupo ainda
                  </p>
                  <p className="text-xs text-[#bbcbb9] max-w-sm mx-auto">
                    Configure o webhook do Unipile para começar a receber mensagens em tempo
                    real.
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  const borderColor =
                    msg.urgency_score === 5
                      ? 'border-[#ffb4ab]'
                      : msg.urgency_score >= 4
                      ? 'border-[#F59E0B]'
                      : 'border-transparent'

                  return (
                    <div
                      key={msg.id}
                      className={`bg-[#131b2e] rounded-xl p-4 border ${borderColor}`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <p className="text-sm font-semibold text-[#4ff07f]">
                          {msg.sender_name || msg.sender_wa_id || 'Desconhecido'}
                        </p>
                        {msg.is_mention && (
                          <span className="material-symbols-outlined text-[#4ff07f] text-[16px]">
                            alternate_email
                          </span>
                        )}
                        <span className="text-[10px] text-[#bbcbb9] ml-auto">
                          {formatTimestamp(msg.sent_at)}
                        </span>
                      </div>
                      <p className="text-sm text-[#dae2fd] leading-relaxed">
                        {msg.content || `[${msg.media_type}]`}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {msg.urgency_score === 5 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#ffb4ab]/10 text-[#ffb4ab] font-semibold uppercase">
                            urgente
                          </span>
                        )}
                        {msg.urgency_score === 4 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F59E0B]/10 text-[#F59E0B] font-semibold uppercase">
                            importante
                          </span>
                        )}
                        {msg.keyword_matched &&
                          msg.keyword_matched.map((kw) => (
                            <span
                              key={kw}
                              className="text-[10px] px-2 py-0.5 rounded-full bg-[#72d8c8]/10 text-[#72d8c8] font-semibold"
                            >
                              {kw}
                            </span>
                          ))}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
