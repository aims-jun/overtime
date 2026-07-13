import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from './test/server'
import App from './App'

describe('App', () => {
  it('renders the employee page after session authentication', async () => {
    server.use(
      http.get('/api/auth/me', () =>
        HttpResponse.json({
          user: {
            id: 'user-1',
            email: 'worker@example.com',
            name: '김야근',
            pictureUrl: null,
            role: 'EMPLOYEE',
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
      await screen.findByRole('heading', { name: '야근 기록' }),
    ).toBeInTheDocument()
    expect(screen.getByText('김야근')).toBeInTheDocument()
  })
})
