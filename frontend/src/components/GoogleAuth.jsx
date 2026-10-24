import { useState, useRef, useEffect } from 'react'
import { useStore, hasData } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { getGoogleAuthUrl, googleAuthLink, webauthnOK, passkeyAssertion, passkeyError } from '../lib/api.js'
import { askAddDeviceData } from '../sheets.jsx'
import { Button, Segmented, Row } from './ui.jsx'
import { MOBILE } from '../lib/mobile.js'

export function GoogleIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 8 }}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  )
}

export function GoogleSignInButton({ onClick, disabled, label }) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        backgroundColor: 'var(--bg-elevated, #fff)',
        color: 'var(--fg, #000)',
        border: '1px solid var(--border, #ccc)'
      }}
    >
      <GoogleIcon />
      {label || t('Continue with Google')}
    </Button>
  )
}

export async function initiateGoogleSignIn({ mobile = MOBILE, returnTo = '/' } = {}) {
  try {
    const res = await getGoogleAuthUrl({ mobile, returnTo })
    if (res?.url) {
      if (mobile) {
        try {
          const { Browser } = await import('@capacitor/browser')
          await Browser.open({ url: res.url, windowName: '_system' })
        } catch {
          window.open(res.url, '_system')
        }
      } else {
        window.location.href = res.url
      }
    } else {
      useUI.getState().toast(t('Google sign-in is not available'))
    }
  } catch (err) {
    useUI.getState().toast(err.message || t('Could not initiate Google sign-in'))
  }
}

export function AccountLinkingSheet({ close, token, email, name }) {
  const { setUser, adoptProfile } = useStore()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [method, setMethod] = useState(webauthnOK() ? 'passkey' : 'password')
  const passkeyAvail = webauthnOK()

  const handlePasswordLink = async (e) => {
    e?.preventDefault()
    if (!password) { setError(t('Enter your password')); return }
    setBusy(true)
    setError('')
    try {
      const res = await googleAuthLink({ token, password })
      if (res?.ok && res.user) {
        setUser(res.user, { adopt: true })
        close()
        await adoptProfile(askAddDeviceData)
        useUI.getState().toast(t('Google account linked. Welcome, {0}', res.user.name))
      }
    } catch (err) {
      setError(err?.data?.error || err.message || t('Failed to link account'))
    } finally {
      setBusy(false)
    }
  }

  const handlePasskeyLink = async () => {
    setBusy(true)
    setError('')
    try {
      const assertion = await passkeyAssertion()
      const res = await googleAuthLink({
        token,
        credential: assertion.credential,
        cid: assertion.cid
      })
      if (res?.ok && res.user) {
        setUser(res.user, { adopt: true })
        close()
        await adoptProfile(askAddDeviceData)
        useUI.getState().toast(t('Google account linked. Welcome, {0}', res.user.name))
      }
    } catch (err) {
      if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
        setError(passkeyError(err, t('Passkey verification failed')))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: '4px 0' }}>
      <h3 style={{ margin: '0 0 8px' }}>{t('Link Google Account')}</h3>
      <div className="muted small" style={{ marginBottom: 16 }}>
        {t('An account with email {0} already exists. To connect your Google account with {1}, please verify your identity.', email, name || t('this profile'))}
      </div>

      {passkeyAvail && (
        <div style={{ marginBottom: 16 }}>
          <Segmented
            options={[
              { value: 'passkey', label: t('Passkey'), icon: 'fingerprint' },
              { value: 'password', label: t('Password'), icon: 'key' }
            ]}
            value={method}
            onChange={setMethod}
          />
        </div>
      )}

      {error && <div style={{ color: 'var(--red)', marginBottom: 12, fontSize: 13 }}>{error}</div>}

      {method === 'passkey' && passkeyAvail ? (
        <div>
          <div className="dim small" style={{ marginBottom: 16 }}>
            {t('Confirm with your device passkey or biometrics.')}
          </div>
          <Button variant="primary" icon="fingerprint" onClick={handlePasskeyLink} disabled={busy}>
            {busy ? t('Verifying…') : t('Verify with passkey')}
          </Button>
        </div>
      ) : (
        <form onSubmit={handlePasswordLink}>
          <input
            type="password"
            className="input"
            placeholder={t('Account password')}
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={busy}
            autoFocus
          />
          <div style={{ height: 14 }} />
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? t('Verifying…') : t('Confirm & link account')}
          </Button>
        </form>
      )}
    </div>
  )
}

export function openAccountLinking({ token, email, name }) {
  useUI.getState().openSheet(close => (
    <AccountLinkingSheet close={close} token={token} email={email} name={name} />
  ))
}

export function handleAuthUrlHash() {
  const hash = window.location.hash || ''
  if (!hash) return false

  if (hash.startsWith('#auth-success')) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    useStore.getState().boot().then(async () => {
      const u = useStore.getState().user
      if (u) {
        await useStore.getState().adoptProfile(askAddDeviceData)
        useUI.getState().toast(t('Welcome back, {0}', u.name))
      }
    })
    return true
  }

  if (hash.startsWith('#auth-error=')) {
    const errCode = decodeURIComponent(hash.slice('#auth-error='.length))
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    let msg = t('Sign-in could not be completed')
    if (errCode === 'invite-required') msg = t('An invite code is required to join this instance')
    else if (errCode === 'account-disabled') msg = t('This account has been disabled')
    else if (errCode === 'invalid-state') msg = t('Authentication session expired, please try again')
    useUI.getState().toast(msg)
    return true
  }

  if (hash.startsWith('#google-link')) {
    const raw = hash.slice('#google-link'.length)
    const params = new URLSearchParams(raw.startsWith('&') ? raw.slice(1) : raw)
    const token = params.get('token')
    const email = params.get('email')
    const name = params.get('name')
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    if (token) {
      setTimeout(() => openAccountLinking({ token, email, name }), 150)
      return true
    }
  }

  return false
}

export function GoogleIdentityRow() {
  const [identities, setIdentities] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    import('../lib/api.js').then(m => m.getIdentities()).then(list => {
      setIdentities(list || [])
      setLoading(false)
    }).catch(() => {
      setIdentities([])
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  const googleId = identities?.find(i => i.provider === 'google')

  const handleDisconnect = () => {
    useUI.getState().confirmSheet({
      title: t('Disconnect Google account?'),
      message: t('You will no longer be able to sign in with Google until you reconnect it.'),
      confirmText: t('Disconnect'),
      danger: true,
      onConfirm: async () => {
        try {
          const { unlinkGoogleIdentity } = await import('../lib/api.js')
          await unlinkGoogleIdentity()
          useUI.getState().toast(t('Google account disconnected'))
          load()
        } catch (err) {
          useUI.getState().toast(err?.data?.error || err.message || t('Failed to disconnect Google'))
        }
      }
    })
  }

  if (loading) return null

  if (googleId) {
    return (
      <Row
        icon="globe"
        iconTint="var(--blue)"
        title={t('Google Account')}
        subtitle={googleId.email ? t('Connected: {0}', googleId.email) : t('Connected')}
        value={t('Disconnect')}
        danger
        onClick={handleDisconnect}
      />
    )
  }

  return (
    <Row
      icon="globe"
      iconTint="var(--blue)"
      title={t('Connect Google Account')}
      subtitle={t('Sign in with Google across your devices.')}
      accessory="chevron"
      onClick={() => initiateGoogleSignIn({ returnTo: '/settings/account' })}
    />
  )
}

