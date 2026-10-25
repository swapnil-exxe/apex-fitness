import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { updateDisplayName } from '../lib/api.js'
import { Button, TextField } from './ui.jsx'
import Icon from './Icon.jsx'
import { GoogleIcon } from './GoogleAuth.jsx'

export function EditProfileSheet({ close }) {
  const user = useStore(s => s.user)
  const setDisplayName = useStore(s => s.setDisplayName)
  const toast = useUI(s => s.toast)

  const [name, setName] = useState(user?.name || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 150)
    return () => clearTimeout(timer)
  }, [])

  const initial = (name || user?.name || '?').trim().charAt(0).toUpperCase()
  const trimmed = name.trim()
  const canSave = trimmed.length > 0 && trimmed !== user?.name && !busy

  const handleSave = async (e) => {
    e?.preventDefault()
    if (!canSave) return
    setBusy(true)
    setError(null)
    try {
      const updatedUser = await updateDisplayName(trimmed)
      setDisplayName(updatedUser.name)
      toast(t('Display name updated'))
      close()
    } catch (err) {
      const msg = err?.data?.error || err?.message || t('Failed to update name')
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  const copyId = () => {
    if (user?.id) {
      navigator.clipboard?.writeText(user.id)
      toast(t('Account ID copied'))
    }
  }

  return (
    <div className="profile-sheet" style={{ padding: '4px 0 16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'var(--acc, #6366f1)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 32,
            fontWeight: 700,
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            marginBottom: 12
          }}
        >
          {initial}
        </div>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
          {t('Edit Profile')}
        </h2>
        <div style={{ fontSize: 13, color: 'var(--muted, #888)' }}>
          {user?.email || t('APEX Fitness Profile')}
        </div>
      </div>

      <form onSubmit={handleSave}>
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--muted, #888)',
              marginBottom: 6
            }}
          >
            {t('Display Name')}
          </label>
          <TextField
            ref={inputRef}
            type="text"
            value={name}
            maxLength={40}
            onChange={e => setName(e.target.value)}
            placeholder={t('Your name')}
            disabled={busy}
            style={{ fontSize: 16, width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4, fontSize: 11, color: 'var(--muted, #888)' }}>
            {name.length}/40
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(239, 68, 68, 0.12)',
              color: 'var(--red, #ef4444)',
              fontSize: 13,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <Icon name="xCircle" style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <Button
            type="button"
            variant="outline"
            onClick={close}
            style={{ flex: 1 }}
          >
            {t('Cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!canSave}
            style={{ flex: 1 }}
          >
            {busy ? t('Saving…') : t('Save Name')}
          </Button>
        </div>
      </form>

      {user && (
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border, rgba(255,255,255,0.08))' }}>
          <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted, #888)', marginBottom: 8 }}>
            {t('Account Details')}
          </div>
          {user.email && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', fontSize: 13 }}>
              <span style={{ color: 'var(--muted, #888)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <GoogleIcon size={16} />
                {t('Google Email')}
              </span>
              <span style={{ fontWeight: 500 }}>{user.email}</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', fontSize: 13 }}>
            <span style={{ color: 'var(--muted, #888)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="person" style={{ width: 16, height: 16 }} />
              {t('Account ID')}
            </span>
            <button
              type="button"
              onClick={copyId}
              style={{
                background: 'none',
                border: 'none',
                padding: '2px 6px',
                color: 'var(--acc, #6366f1)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
              title={t('Copy ID')}
            >
              <span>{user.id}</span>
              <Icon name="clipboard" style={{ width: 12, height: 12 }} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function openEditProfileSheet() {
  useUI.getState().openSheet(close => <EditProfileSheet close={close} />)
}
