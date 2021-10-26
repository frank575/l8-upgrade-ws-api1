const dotenv = require('dotenv')

dotenv.config()
dotenv.config({ path: `.env.${process.env.NODE_ENV}` })

const { APP_PORT } = process.env

const express = require('express')
const cors = require('cors')
const app = express()

const http = require('http')
const server = http.createServer(app)

const { Server } = require('socket.io')
const io = new Server(server)

app.use(cors())

app.get('/', (req, res) => {
	res.send('你好，還活著哦！')
})

let questionId = 1

const createContentAndMatches = (indexMap, content) => {
	return {
		content,
		matches: content.filter((_, i) => indexMap[i] != null).map(e => e.id),
	}
}

let startTime = Date.now()
const QUESTIONS = [
	{
		id: questionId++,
		title: '信箱',
		description:
			'@前只能是【英/數/./_字符且首字為英文】，@後必須為【英文.英文】的格式',
		...createContentAndMatches({ 2: 1, 7: 1, 8: 1 }, [
			{ id: questionId++, name: 'sadknasaw12@' },
			{ id: questionId++, name: 'asdvsa@asad' },
			{ id: questionId++, name: 'aaaa1234@yahoo.com' },
			{ id: questionId++, name: 'dsa123@yahoo.' },
			{ id: questionId++, name: 'dsakvsabjk@yahoo_com' },
			{ id: questionId++, name: 'dsakvsayahoo.com' },
			{ id: questionId++, name: '@yahoo.com' },
			{ id: questionId++, name: 'bbcnews@gmail.com' },
			{ id: questionId++, name: 'bbc.news_good11@gmail.com' },
			{ id: questionId++, name: '._@gmail.com' },
		]),
	},
]
const MESSAGE_TYPE = {
	OVER: ['OVER', '遊戲結束'],
}
let current = 0
let userMap = {}
let messages = []

// const commonResponse = {
// 	type, ranks?,
// }

const next = () => {
	if (current < QUESTIONS.length - 1) {
		return current++
	}
	current = 0
}

const restart = () => {
	const ranks = Object.keys(userMap)
		.map(k => userMap[k])
		.sort(e => e.score)
		.splice(0, 3)

	startTime = Date.now()
	userMap = {}
	messages = []

	io.emit('messages', {
		type: MESSAGE_TYPE.OVER[0],
		ranks,
		message: MESSAGE_TYPE.OVER[1],
	})
}

setInterval(() => {
	const now = Date.now()
	const end = startTime + 3600000
	const expired = now >= end
	console.log(`時間檢測：now: ${now}, end: ${end}, expired: ${expired}`)
	if (expired) {
		startTime = now
		restart()
	}
}, 15000)

const { uuid } = require('uuidv4')

io.on('connection', socket => {
	console.log('user connection', uuid())
	socket.on('RE_START', restart)
	socket.on('disconnect', () => {
		console.log('user disconnected')
	})
})

server.listen(process.env.PORT || APP_PORT, () => {
	console.log(`listening on *:${process.env.PORT || APP_PORT}`)
})
