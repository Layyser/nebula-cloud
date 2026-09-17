import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProductTrailer, TRAILER_POSTER, TRAILER_URL } from '../src/components/landing/ProductTrailer'

test('the initial trailer is keyboard-accessible and does not fetch video', () => {
  const html = renderToStaticMarkup(<ProductTrailer />)
  expect(html).toContain('<button')
  expect(html).toContain('Play Nubols product walkthrough')
  expect(html).toContain(TRAILER_POSTER)
  expect(html).toContain('loading="lazy"')
  expect(html).not.toContain('<video')
  expect(html).not.toContain(TRAILER_URL)
  expect(html).not.toContain('<iframe')
})
