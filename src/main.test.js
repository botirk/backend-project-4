import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { beforeAll, beforeEach, expect, test } from 'vitest'
import nock from 'nock'
import * as cheerio from 'cheerio'
import downloadPageWithResourcesToFolder from './main.js'

const site = 'https://nodejs.org/'
const target = site + 'fetch.html'
const altFetch = cheerio.load(await fs.readFile('fixtures/alt_fetch.html', 'utf-8')).html()
const pairs = {
  'nodejs-org-fetch_files/nodejs-org-benhalverson.jpeg': 'benhalverson.jpeg',
  'nodejs-org-fetch_files/nodejs-org-LankyMoose.jpeg': 'LankyMoose.jpeg',
  'nodejs-org-fetch_files/nodejs-org-content.js': 'content.js',
  'nodejs-org-fetch_files/nodejs-org-styles.css': 'styles.css',
  'nodejs-org-fetch_files/nodejs-org-favicon.png': 'favicon.png',
  'nodejs-org-fetch_files/nodejs-org-f09ec2eb560436bd-s-p.woff2': 'f09ec2eb560436bd-s.p.woff2',
  'nodejs-org-fetch_files/nodejs-org-731ebdadd749837e-s-p.woff2': '731ebdadd749837e-s.p.woff2',
}

/** @type {string} */
let tmpFolder = ''

beforeAll(async () => {
  for (const file of await fs.readdir('fixtures', { withFileTypes: true })) {
    nock(site)
      .get('/' + file.name)
      .reply(200, await fs.readFile(path.join(file.parentPath, file.name)))
      .persist()
  }

  nock('https://404.com')
    .get('/')
    .reply(404)
    .persist()

  nock('https://403.com')
    .get('/')
    .reply(403)
    .persist()

  nock('https://401.com')
    .get('/')
    .reply(401)
    .persist()

  nock('https://500.com')
    .get('/')
    .reply(500)
    .persist()

  nock.disableNetConnect()
})

beforeEach(async () => {
  tmpFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'page-loader-'))
})

test.sequential('throws on invalid url', async () => {
  await expect(downloadPageWithResourcesToFolder('nosuchprotocol://nosuchpage', tmpFolder)).rejects.toThrow()
})

test.sequential('download mocked html with resources - fail', async () => {
  await expect(downloadPageWithResourcesToFolder('nosuchprotocol://nosuchpage.img', tmpFolder)).rejects.toThrow()
})

test.sequential('download mocked html to folder - html success', async () => {
  const resultPath = await downloadPageWithResourcesToFolder(target, tmpFolder)
  const found = resultPath.find(path => path.includes('nodejs-org-fetch.html'))
  expect(found).toBeTruthy()
  if (!found) throw new Error('not found')
  expect(await fs.readFile(found, 'utf-8')).toBe(altFetch)
})

test.sequential('download mocked html to folder - resources success', async () => {
  const resultPath = await downloadPageWithResourcesToFolder(target, tmpFolder)
  for (const pair of Object.entries(pairs)) {
    const result = resultPath.find(result => result.includes(pair[0]))
    expect(result).toBeTruthy()
    expect(await fs.readFile(result, 'utf-8')).toBe(await fs.readFile(path.join('fixtures', pair[1]), 'utf-8'))
  }
})

test.sequential('download mocked html with resources - folder fail', async () => {
  await expect(downloadPageWithResourcesToFolder(target, tmpFolder + '0')).rejects.toThrowError(`no such file or directory, lstat '${tmpFolder + '0'}'`)
})

test.sequential('download 404 - fail', async () => {
  await expect(downloadPageWithResourcesToFolder('https://404.com/', tmpFolder)).rejects.toThrowError(`404 Not Found 'https://404.com/'`)
})

test.sequential('download 403 - fail', async () => {
  await expect(downloadPageWithResourcesToFolder('https://403.com/', tmpFolder)).rejects.toThrowError(`403 Forbidden 'https://403.com/'`)
})

test.sequential('download 401 - fail', async () => {
  await expect(downloadPageWithResourcesToFolder('https://401.com/', tmpFolder)).rejects.toThrowError(`401 Unauthorized 'https://401.com/'`)
})

test.sequential('download 500 - fail', async () => {
  await expect(downloadPageWithResourcesToFolder('https://500.com/', tmpFolder)).rejects.toThrowError(`500 Internal Server Error 'https://500.com/'`)
})
