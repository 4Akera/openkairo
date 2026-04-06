import { useState, useEffect } from 'react'
import { CheckCheck, Clock } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../stores/authStore'
import type { BlockAcknowledgment } from '../../../types'
import { formatDateTime } from '../../../lib/utils'
import { Button } from '../../ui'

export function AcknowledgmentPanel({
  blockId,
  readOnly = false,
}: {
  blockId: string
  readOnly?: boolean
}) {
  const { user, profile } = useAuthStore()
  const [acks, setAcks] = useState<BlockAcknowledgment[]>([])
  const [acking, setAcking] = useState(false)

  useEffect(() => {
    loadAcks()
    const channel = supabase
      .channel(`acks:${blockId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'block_acknowledgments',
          filter: `block_id=eq.${blockId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setAcks((prev) => {
              const incoming = payload.new as BlockAcknowledgment
              if (prev.some((a) => a.id === incoming.id)) return prev
              return [...prev, incoming]
            })
          }
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [blockId])

  const loadAcks = async () => {
    const { data } = await supabase
      .from('block_acknowledgments')
      .select('*')
      .eq('block_id', blockId)
      .order('acked_at', { ascending: true })
    if (data) setAcks(data as BlockAcknowledgment[])
  }

  const myAck = user ? acks.find((a) => a.acked_by === user.id) : null

  const acknowledge = async () => {
    if (!user || myAck) return
    setAcking(true)
    const { data, error } = await supabase
      .from('block_acknowledgments')
      .insert({
        block_id: blockId,
        acked_by: user.id,
        acker_name: profile?.full_name || null,
      })
      .select()
      .single()
    if (!error && data) {
      setAcks((prev) => {
        if (prev.some((a) => a.id === (data as BlockAcknowledgment).id)) return prev
        return [...prev, data as BlockAcknowledgment]
      })
    }
    setAcking(false)
  }

  return (
    <div className="border-t border-border/50 bg-green-50/30">
      <div className="px-3 py-2 space-y-1.5">
        <div className="flex items-center gap-2">
          <CheckCheck className="w-3.5 h-3.5 text-green-600" />
          <span className="text-xs font-medium text-green-800">Acknowledgment Required</span>
          {!readOnly && !myAck && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-6 text-xs border-green-400 text-green-700 hover:bg-green-100"
              onClick={acknowledge}
              disabled={acking}
            >
              {acking ? 'Acknowledging…' : 'Acknowledge'}
            </Button>
          )}
          {myAck && (
            <span className="ml-auto text-[10px] text-green-600 font-medium">✓ You acknowledged</span>
          )}
        </div>

        {acks.length > 0 && (
          <div className="space-y-0.5">
            {acks.map((ack) => (
              <div key={ack.id} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Clock className="w-2.5 h-2.5" />
                <span className="font-medium text-green-700">
                  {ack.acker_name || 'Unknown'}
                </span>
                <span>·</span>
                <span>{formatDateTime(ack.acked_at)}</span>
              </div>
            ))}
          </div>
        )}

        {acks.length === 0 && (
          <p className="text-[10px] text-muted-foreground">No acknowledgments yet.</p>
        )}
      </div>
    </div>
  )
}
