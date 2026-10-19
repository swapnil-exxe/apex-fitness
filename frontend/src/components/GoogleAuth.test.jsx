// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GoogleIcon, GoogleSignInButton, GoogleIdentityRow, AccountLinkingSheet, handleAuthUrlHash } from './GoogleAuth.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const store = {
    user: { id: 'u1', name: 'Athlete', admin: false },
    boot: vi.fn(async () => {}),
    setUser: vi.fn(),
    adoptProfile: vi.fn(async () => {}),
  }
  const ui = {
    toast: vi.fn(),
    openSheet: vi.fn(),
    confirmSheet: vi.fn(),
  }
  return { store, ui }
})

vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.store) : mocks.store
  useStore.getState = () => mocks.store
  return { useStore, hasData: () => false }
})

vi.mock('../store/useUI.js', () => {
  const useUI = selector => selector ? selector(mocks.ui) : mocks.ui
  useUI.getState = () => mocks.ui
  return { useUI }
})

vi.mock('../lib/api.js', () => ({
  webauthnOK: () => true,
  getGoogleAuthUrl: vi.fn(async () => ({ url: 'https://accounts.google.com/o/oauth2/v2/auth?test=1' })),
  googleAuthLink: vi.fn(async () => ({ ok: true, user: { id: 'u1', name: 'Athlete' } })),
  getIdentities: vi.fn(async () => [{ provider: 'google', email: 'athlete@example.com' }]),
  unlinkGoogleIdentity: vi.fn(async () => ({ ok: true })),
  passkeyAssertion: vi.fn(async () => ({ cid: 'c1', credential: { id: 'cred1' } })),
  passkeyError: vi.fn((e, fb) => fb),
}))

vi.mock('../sheets.jsx', () => ({
  askAddDeviceData: vi.fn(),
}))

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
  vi.clearAllMocks()
  window.location.hash = ''
})

afterEach(() => {
  act(() => { mounted.splice(0).forEach(({ root, host }) => { root.unmount(); host.remove() }) })
})

describe('GoogleAuth Components', () => {
  it('renders GoogleIcon SVG correctly', () => {
    const host = mount(<GoogleIcon size={24} />)
    const svg = host.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg.getAttribute('width')).toBe('24')
  })

  it('renders GoogleSignInButton with custom or default label and handles clicks', () => {
    const onClick = vi.fn()
    const host = mount(<GoogleSignInButton onClick={onClick} label="Sign up with Google" />)
    const button = host.querySelector('button')
    expect(button.textContent).toContain('Sign up with Google')
    act(() => button.click())
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders GoogleIdentityRow showing connected email and disconnect button', async () => {
    const host = mount(<GoogleIdentityRow />)
    // Wait for async load()
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })
    expect(host.textContent).toContain('Google Account')
    expect(host.textContent).toContain('athlete@example.com')
    expect(host.textContent).toContain('Disconnect')
  })

  it('renders AccountLinkingSheet with email and handles passkey linking', async () => {
    const close = vi.fn()
    const host = mount(<AccountLinkingSheet close={close} token="tok123" email="athlete@example.com" name="Athlete" />)
    expect(host.textContent).toContain('Link Google Account')
    expect(host.textContent).toContain('athlete@example.com')

    const verifyBtn = [...host.querySelectorAll('button')].find(b => b.textContent.includes('Verify with passkey'))
    expect(verifyBtn).toBeTruthy()
    await act(async () => {
      verifyBtn.click()
      await new Promise(r => setTimeout(r, 50))
    })

    expect(close).toHaveBeenCalled()
    expect(mocks.store.setUser).toHaveBeenCalled()
  })

  it('handles auth URL hash events properly', () => {
    window.location.hash = '#auth-error=invalid-state'
    const handled = handleAuthUrlHash()
    expect(handled).toBe(true)
    expect(mocks.ui.toast).toHaveBeenCalledWith('Authentication session expired, please try again')
    expect(window.location.hash).toBe('')
  })
})
