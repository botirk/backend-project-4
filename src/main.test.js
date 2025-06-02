import { beforeAll, expect, test } from 'vitest'
import nock from 'nock'
import fs from 'node:fs/promises'

import { downloadPage } from './main.js'

const fetchFixture = await fs.readFile('fixtures/fetch.html', 'utf-8')

const fetchSite = 'https://nodejs.org'
const fetchUrl = '/en/learn/getting-started/fetch'

beforeAll(() => {
  nock(fetchSite)
    .get(fetchUrl)
    .reply(200, fetchFixture, { 'content-type': 'text/html' })

  nock.disableNetConnect()
})

test('throws on invalid url', async () => {
  await expect(downloadPage('nosuchprotocol://nosuchpage')).rejects.toThrow()
})

test('download mocked url', async () => {
  await expect(downloadPage(fetchSite + fetchUrl)).resolves.toBe(fetchFixture)
})
