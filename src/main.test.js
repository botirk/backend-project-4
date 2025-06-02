import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { beforeAll, expect, test } from 'vitest'
import nock from 'nock'
import { downloadPage, downloadPageToFolder } from './main.js'


const fetchFixture = await fs.readFile('fixtures/fetch.html', 'utf-8')
const fetchSite = 'https://nodejs.org'
const fetchUrl = '/en/learn/getting-started/fetch'
let tmpFolder;

beforeAll(async () => {
  nock(fetchSite)
    .get(fetchUrl)
    .reply(200, fetchFixture, { 'content-type': 'text/html', 'Content-Disposition': 'attachment; filename="fetch.html"' })
    .persist()

  nock.disableNetConnect()

  tmpFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'page-loader-'))
})

test('throws on invalid url', async () => {
  await expect(downloadPage('nosuchprotocol://nosuchpage')).rejects.toThrow()
})

test('download mocked url', async () => {
  const result = await downloadPage(fetchSite + fetchUrl)
  expect(result.text).toBe(fetchFixture)
})

test('download mocked url to file', async () => {
  const resultPath = await downloadPageToFolder(fetchSite + fetchUrl, tmpFolder)
  expect(resultPath.includes('.html')).toBeTruthy()
  const resultFile = await fs.readFile(resultPath, 'utf-8')
  expect(resultFile).toBe(fetchFixture)
})

test('download mocked url to file - test name', async () => {
  const resultPath = await downloadPageToFolder(fetchSite + fetchUrl, tmpFolder)
  expect(resultPath).toContain('nodejs-org-en-learn-getting-started-fetch.html')
})

test('download mocked url to file - fail', async () => {
  await expect(downloadPageToFolder('nosuchprotocol://nosuchpage', tmpFolder)).rejects.toThrow()
})
