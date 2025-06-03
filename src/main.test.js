import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { beforeAll, beforeEach, expect, test } from 'vitest'
import nock from 'nock'
import * as cheerio from 'cheerio'
import { downloadImg, downloadPage, downloadPageToFolder, downloadPageWithResourcesToFolder } from './main.js'

const fetchFixture = await fs.readFile('fixtures/fetch.html', 'utf-8')
const fetchSite = 'https://nodejs.org'
const fetchUrl = '/en/learn/getting-started/fetch'
const imgFixture = await fs.readFile('fixtures/benhalverson.jpeg')
const imgFixture2 = await fs.readFile('fixtures/LankyMoose.jpeg')
const imgSite = 'https://avatars.githubusercontent.com'
const imgUrl = '/benhalverson'
const imgUrl2 = '/en/learn/getting-started/benhalverson.jpeg'
const imgUrl3 = '/en/learn/getting-started/LankyMoose.jpeg'
const altFetchFixture = await fs.readFile('fixtures/alt_fetch.html', 'utf-8')
/** @type {string} */
let tmpFolder = ''

beforeAll(() => {
  nock(fetchSite)
    .get(fetchUrl)
    .reply(200, fetchFixture, { 'content-type': 'text/html', 'Content-Disposition': 'attachment; filename="fetch.html"' })
    .persist()

  nock(fetchSite)
    .get(imgUrl2)
    .reply(200, imgFixture, { 'content-type': 'image/jpeg' })
    .persist()

  nock(fetchSite)
    .get(imgUrl3)
    .reply(200, imgFixture2, { 'content-type': 'image/jpeg' })
    .persist()

  nock(imgSite)
    .get(imgUrl)
    .reply(200, imgFixture, { 'content-type': 'image/jpeg' })
    .persist()

  nock.disableNetConnect()
})

beforeEach(async () => {
  tmpFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'page-loader-'))
})

test.sequential('throws on invalid url', async () => {
  await expect(downloadPage('nosuchprotocol://nosuchpage')).rejects.toThrow()
})

test.sequential('download mocked url', async () => {
  const result = await downloadPage(fetchSite + fetchUrl)
  expect(result.text).toBe(fetchFixture)
})

test.sequential('download mocked url to file', async () => {
  const resultPath = await downloadPageToFolder(fetchSite + fetchUrl, tmpFolder)
  expect(resultPath.includes('.html')).toBeTruthy()
  const resultFile = await fs.readFile(resultPath, 'utf-8')
  expect(resultFile).toBe(fetchFixture)
})

test.sequential('download mocked url to file - test name', async () => {
  const resultPath = await downloadPageToFolder(fetchSite + fetchUrl, tmpFolder)
  expect(resultPath).toContain('nodejs-org-en-learn-getting-started-fetch.html')
})

test.sequential('download mocked url to file - fail', async () => {
  await expect(downloadPageToFolder('nosuchprotocol://nosuchpage', tmpFolder)).rejects.toThrow()
})

test.sequential('download mocked url to img - fail', async () => {
  await expect(downloadImg('nosuchprotocol://nosuchpage.img')).rejects.toThrow()
})

test.sequential('download mocked url to img - fail', async () => {
  const result = await downloadImg('https://avatars.githubusercontent.com/benhalverson')

  expect(result.buffer.equals(imgFixture)).toBeTruthy()
})

test.sequential('download mocked html with resources - fail', async () => {
  await expect(downloadPageWithResourcesToFolder('nosuchprotocol://nosuchpage.img', tmpFolder)).rejects.toThrow()
})

test.sequential('download mocked html with resources - success', async () => {
  const result = await downloadPageWithResourcesToFolder(fetchSite + fetchUrl, tmpFolder)
  const htmlPath = result.find(path => path.includes('.html'))
  if (!htmlPath) throw new Error('html path not found')
  const html = await fs.readFile(htmlPath, 'utf-8')
  expect(html).toBe(cheerio.load(altFetchFixture).html())

  const imgs = result.filter(path => path.includes('.jpeg'))
  expect(imgs).length(2)

  const imgOne = result.find(path => path.includes('nodejs-org-en-learn-getting-started-fetch_files/nodejs-org-en-learn-getting-started-benhalverson.jpeg'))
  expect(imgOne).toBeTruthy()
  if (!imgOne) throw new Error('not found')
  const imgOneLoaded = await fs.readFile(imgOne)
  expect(imgOneLoaded.equals(imgFixture))
})
