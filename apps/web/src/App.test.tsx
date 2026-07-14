import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from './test/server'
import App from './App'
import { router } from './app/router'

describe('App', () => {
  it('renders the employee page after session authentication', async () => {
    await router.navigate('/')
    server.use(
      http.get('/api/auth/me', () =>
        HttpResponse.json({
          user: {
            id: 'user-1',
            email: 'worker@example.com',
            name: '김야근',
            isAdmin: false,
          },
        }),
      ),
      http.get('/api/overtime', () =>
        HttpResponse.json({ month: '2026-07', records: [], totalMinutes: 0 }),
      ),
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    )

    expect(
      await screen.findByRole('heading', { name: '업무 연장 내역' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'AIMS' })).toBeInTheDocument()
    expect(screen.getByText('김야근')).toBeInTheDocument()
  })

  it('does not show the administrator page to an employee', async () => {
    server.use(
      http.get('/api/auth/me', () =>
        HttpResponse.json({
          user: {
            id: 'user-1',
            email: 'worker@example.com',
            name: '김야근',
            isAdmin: false,
          },
        }),
      ),
    )
    await router.navigate('/admin')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    )

    expect(
      await screen.findByText('접근 권한이 없습니다'),
    ).toBeInTheDocument()
  })

  it('redirects an administrator home without loading personal overtime', async () => {
    const overtimeRequest = vi.fn()
    server.use(
      http.get('/api/auth/me', () =>
        HttpResponse.json({
          user: {
            id: 'admin-1',
            email: 'contact@aimskr.com',
            name: 'AIMS 관리자',
            isAdmin: true,
          },
        }),
      ),
      http.get('/api/overtime', () => {
        overtimeRequest()
        return HttpResponse.json({ month: '2026-07', records: [], totalMinutes: 0 })
      }),
      http.get('/api/admin/users', () => HttpResponse.json([])),
      http.get('/api/admin/reports', () =>
        HttpResponse.json({
          month: '2026-07',
          totalMinutes: 0,
          totalsByUser: [],
          records: [],
        }),
      ),
    )
    await router.navigate('/')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    )

    expect(
      await screen.findByRole('heading', { name: '업무 연장 현황' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin')
    expect(screen.getByRole('link', { name: 'AIMS' })).toHaveAttribute(
      'href',
      '/admin',
    )
    expect(
      screen.queryByRole('heading', { name: '업무 연장 내역' }),
    ).not.toBeInTheDocument()
    expect(overtimeRequest).not.toHaveBeenCalled()
  })
})
