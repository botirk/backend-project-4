import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { beforeAll, beforeEach, expect, test } from 'vitest'
import nock from 'nock'
import * as cheerio from 'cheerio'
import { downloadImg, downloadResource, downloadPageToFolder, downloadPageWithResourcesToFolder } from './main.js'

const fetchFixture = await fs.readFile('fixtures/fetch.html', 'utf-8')
const fetchSite = 'https://nodejs.org'
const fetchUrl = '/en/learn/getting-started/fetch'
const imgFixture = await fs.readFile('fixtures/benhalverson.jpeg')
const imgFixture2 = await fs.readFile('fixtures/LankyMoose.jpeg')
const imgSite = 'https://avatars.githubusercontent.com'
const imgUrl = '/benhalverson'
const imgUrl2 = '/en/learn/getting-started/benhalverson.jpeg'
const imgUrl3 = '/en/learn/getting-started/LankyMoose.jpeg'

const cssUrl = '/en/learn/getting-started/3e23ad33dbb6484e.css'
const cssFixture = await fs.readFile('fixtures/3e23ad33dbb6484e.css', 'utf-8')
const cssUrl2 = '/en/learn/getting-started/9e8497ea5a5e8b00.css'
const cssFixture2 = await fs.readFile('fixtures/9e8497ea5a5e8b00.css', 'utf-8')
const cssUrl3 = '/en/learn/getting-started/31aabc727fa2df50.css'
const cssFixture3 = await fs.readFile('fixtures/31aabc727fa2df50.css', 'utf-8')
const cssUrl4 = '/en/learn/getting-started/742739d87475cc29.css'
const cssFixture4 = await fs.readFile('fixtures/742739d87475cc29.css', 'utf-8')
const cssUrl5 = '/en/learn/getting-started/5c3fb37fa4e4f60.css'
const cssFixture5 = await fs.readFile('fixtures/5c3fb37fa4e4f60.css', 'utf-8')

const jsPath = '/en/learn/getting-started/'
const jsResources = [
  '006ef967-17db6e247c64a1cf.js',
  '1226-efa5667006332d27.js',
  '3156-a912ef747cb1d460.js',
  '8355-274d61ab2acf4d58.js',
  '9581-9ef49566f5dcc5f1.js',
  'error-f228f493d5060b23.js',
  'global-error-781124ab1e42e221.js',
  'main-app-58302bc9d8e3c3bf.js',
  'not-found-a2b411b1d8fb2f02.js',
  'page-b62be7af8bd647ed.js',
  'polyfills-42372ed130431b0a.js',
  'webpack-793d346370d5662d.js',
]

const altFetchFixture = await fs.readFile('fixtures/alt_fetch.html', 'utf-8')
/** @type {string} */
let tmpFolder = ''

beforeAll(async () => {
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

  nock(fetchSite)
    .get(cssUrl)
    .reply(200, cssFixture, { 'content-type': 'text/css' })
    .persist()

  nock(fetchSite)
    .get(cssUrl2)
    .reply(200, cssFixture2, { 'content-type': 'text/css' })
    .persist()

  nock(fetchSite)
    .get(cssUrl3)
    .reply(200, cssFixture3, { 'content-type': 'text/css' })
    .persist()

  nock(fetchSite)
    .get(cssUrl4)
    .reply(200, cssFixture4, { 'content-type': 'text/css' })
    .persist()

  nock(fetchSite)
    .get(cssUrl5)
    .reply(200, cssFixture5, { 'content-type': 'text/css' })
    .persist()

  for (const jsResource of jsResources) {
    nock(fetchSite)
      .get(jsPath + jsResource)
      .reply(200, await fs.readFile('fixtures/' + jsResource, 'utf-8'), { 'content-type': 'text/javascript' })
      .persist()
  }

  nock.disableNetConnect()
})

beforeEach(async () => {
  tmpFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'page-loader-'))
})

test.sequential('throws on invalid url', async () => {
  await expect(downloadResource('nosuchprotocol://nosuchpage')).rejects.toThrow()
})

test.sequential('download mocked url', async () => {
  const result = await downloadResource(fetchSite + fetchUrl)
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

test.sequential('download mocked html with resources - img success', async () => {
  const result = await downloadPageWithResourcesToFolder(fetchSite + fetchUrl, tmpFolder)
  const htmlPath = result.find(path => path.includes('.html'))
  if (!htmlPath) throw new Error('html path not found')
  const html = await fs.readFile(htmlPath, 'utf-8')
  expect(html).toBe(cheerio.load(altFetchFixture).html())

  const imgs = result.filter(path => path.endsWith('.jpeg'))
  expect(imgs).length(2)

  const imgOne = result.find(path => path.endsWith('nodejs-org-en-learn-getting-started-fetch_files/nodejs-org-en-learn-getting-started-benhalverson.jpeg'))
  expect(imgOne).toBeTruthy()
  if (!imgOne) throw new Error('not found')
  const imgOneLoaded = await fs.readFile(imgOne)
  expect(imgOneLoaded.equals(imgFixture))
})

test.sequential('download mocked html with resources - css success', async () => {
  const result = await downloadPageWithResourcesToFolder(fetchSite + fetchUrl, tmpFolder)
  const csss = result.filter(path => path.endsWith('.css'))
  expect(csss).length(5)

  let css = result.find(path => path.endsWith('nodejs-org-en-learn-getting-started-fetch_files/nodejs-org-en-learn-getting-started-5c3fb37fa4e4f60.css'))
  if (!css) throw new Error('not found')
  let cssLoaded = await fs.readFile(css, 'utf-8')
  expect(cssLoaded).toBe(cssFixture5)

  css = result.find(path => path.endsWith('nodejs-org-en-learn-getting-started-fetch_files/nodejs-org-en-learn-getting-started-742739d87475cc29.css'))
  if (!css) throw new Error('not found')
  cssLoaded = await fs.readFile(css, 'utf-8')
  expect(cssLoaded).toBe(cssFixture4)

  css = result.find(path => path.endsWith('nodejs-org-en-learn-getting-started-fetch_files/nodejs-org-en-learn-getting-started-9e8497ea5a5e8b00.css'))
  if (!css) throw new Error('not found')
  cssLoaded = await fs.readFile(css, 'utf-8')
  expect(cssLoaded).toBe(cssFixture2)

  css = result.find(path => path.endsWith('nodejs-org-en-learn-getting-started-fetch_files/nodejs-org-en-learn-getting-started-3e23ad33dbb6484e.css'))
  if (!css) throw new Error('not found')
  cssLoaded = await fs.readFile(css, 'utf-8')
  expect(cssLoaded).toBe(cssFixture)

  css = result.find(path => path.endsWith('nodejs-org-en-learn-getting-started-fetch_files/nodejs-org-en-learn-getting-started-31aabc727fa2df50.css'))
  if (!css) throw new Error('not found')
  cssLoaded = await fs.readFile(css, 'utf-8')
  expect(cssLoaded).toBe(cssFixture3)
})

test.sequential('download mocked html with resources - js success', async () => {
  const result = await downloadPageWithResourcesToFolder(fetchSite + fetchUrl, tmpFolder)
  console.log(result)
  const jss = result.filter(path => path.endsWith('.js'))
  expect(jss).length(jsResources.length)
})
