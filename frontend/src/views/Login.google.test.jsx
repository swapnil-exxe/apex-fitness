// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Login from './Login.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const state = { webauthn: true, config: null, sheets: [] }
  state.snapshot = () => ({
    config: state.config, S: {}, user: null,
    setUser: vi.fn(), adoptProfile: vi.fn(), setGuest: vi.fn(), loadConfig: vi.fn(async () => state.config),
    pushState: vi.fn(), pullState: vi.fn(),
  })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore, hasData: () => false }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: vi.fn(), openSheet: render => { mocks.sheets.push(render); return {} } })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('../lib/api.js', () => ({
  webauthnOK: () => mocks.webauthn, passkeyLogin: vi.fn(), passkeyRegister: vi.fn(), bio: () => 'your fingerprint',
  api: vi.fn(), passkeyAssertion: vi.fn(), passwordLogin: vi.fn(), passwordRegister: vi.fn(),
}))
vi.mock('../components/GoogleAuth.jsx', () => ({
  GoogleSignInButton: ({ onClick }) => <button data-testid="google-signin-btn" onClick={onClick}>Continue with Google</button>,
  initiateGoogleSignIn: vi.fn(),
  handleAuthUrlHash: vi.fn(),
}))
vi.mock('../sheets.jsx', () => ({ askAddDeviceData: vi.fn() }))

const mounted = []
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  act(() => root.render(el))
  return host
}

beforeEach(() => {
  mocks.webauthn = true
  mocks.config = { google_auth: true, password_login: true, allow_guest: true }
  mocks.sheets.length = 0
})
afterEach(() => {
  act(() => { mounted.splice(0).forEach(({ root, host }) => { root.unmount(); host.remove() }) })
})

describe('Login Google-first normal user experience', () => {
  it('renders Google sign-in as primary option and hides raw password/pairing fields by default', () => {
    const page = mount(<Login />)
    const googleBtn = page.querySelector('[data-testid="google-signin-btn"]')
    expect(googleBtn).toBeTruthy()
    expect(googleBtn.textContent).toBe('Continue with Google')

    // Privacy policy link present
    const privacyLink = page.querySelector('a[href="/privacy.html"]')
    expect(privacyLink).toBeTruthy()

    // Normal view does not show password/passkey buttons unless advanced options is clicked
    const buttons = [...page.querySelectorAll('button')].map(b => b.textContent)
    expect(buttons).not.toContain('Sign in with password')
    expect(buttons).not.toContain('Use a code from your other device')
    expect(buttons).toContain('Advanced options')
  })

  it('reveals advanced options upon clicking Advanced options', () => {
    const page = mount(<Login />)
    const advBtn = [...page.querySelectorAll('button')].find(b => b.textContent === 'Advanced options')
    expect(advBtn).toBeTruthy()
    act(() => advBtn.click())

    const buttonsAfter = [...page.querySelectorAll('button')].map(b => b.textContent)
    expect(buttonsAfter).toContain('Sign in with passkey')
    expect(buttonsAfter).toContain('Sign in with password')
  })
})
