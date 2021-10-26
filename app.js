const dotenv = require('dotenv')

dotenv.config()
dotenv.config({ path: `.env.${process.env.NODE_ENV}` })

const { APP_PORT } = process.env

const express = require('express')
const cors = require('cors')
const app = express()

const http = require('http')
const server = http.createServer(app)

const io = require('socket.io')(server, {
	cors: {
		origin: '*',
	},
})

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
	JOIN: ['JOIN', '連接成功'],
	OVER: ['OVER', '遊戲結束'],
	PONG: ['PONG', '乓'],
}
let userNotFoundNum = 0
let current = 0
let userMap = {}
let onlineUserMap = {}
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

const getQuestion = () => {
	return QUESTIONS[current]
}

const getUsers = () =>
	Object.keys(userMap).map(id => {
		const { socketId, ...otherInfo } = userMap[id]
		return {
			...otherInfo,
			id,
			online: onlineUserMap[id] != null,
		}
	})

const restart = () => {
	const ranks = getUsers()
		.sort(e => e.score)
		.splice(0, 3)

	startTime = Date.now()
	userMap = {}
	onlineUserMap = {}
	messages = []

	io.emit('messages', {
		type: MESSAGE_TYPE.OVER[0],
		message: MESSAGE_TYPE.OVER[1],
		ranks,
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

const { v4: uuidv4 } = require('uuid')

const getNotFoundUser = (userId, socketId) => {
	const name = `匿名者${++userNotFoundNum}`
	const user = {
		name,
		socketId,
		score: 0,
	}
	userMap[userId] = user
	return user
}

io.on('connection', socket => {
	console.log('user connection')

	const userInfoString = socket.handshake.headers['user_info']
	let socketId = socket.id
	let userId, user
	if (userInfoString != null) {
		try {
			const userInfo = JSON.parse(userInfoString)
			const id = userInfo.id
			const name = userInfo.name
			if (name == null && id == null) {
				throw new Error('什麼都沒傳')
			} else if (id == null) {
				userId = uuidv4()
				user = {
					name,
					socketId,
					score: 0,
				}
				userMap[userId] = user
			} else {
				if (userMap[id] == null) {
					throw new Error('找不到使用者')
				}
				userId = id
				userMap[userId].socketId = socketId
				user = userMap[userId]
			}
		} catch (err) {
			console.error(err)
			userId = uuidv4()
			user = getNotFoundUser(userId, socketId)
		}
	} else {
		userId = uuidv4()
		user = getNotFoundUser(userId, socketId)
	}
	onlineUserMap[userId] = socketId

	socket.emit('connection', {
		type: MESSAGE_TYPE.JOIN[0],
		message: MESSAGE_TYPE.JOIN[1],
		user,
		users: getUsers(),
		question: getQuestion(),
		messages,
	})

	socket.on('restart', restart)

	socket.on('ping', () => {
		console.log(`ping with ${user.name}`)
		socket.emit('ping', {
			type: MESSAGE_TYPE.PONG[0],
			message: MESSAGE_TYPE.PONG[1],
		})
	})

	// 私發
	// socket.broadcast.to(socketid).emit('message', 'for your eyes only');

	socket.on('disconnect', () => {
		delete onlineUserMap[userId]
		console.log('user disconnected')
	})
})

server.listen(process.env.PORT || APP_PORT, () => {
	console.log(`listening on *:${process.env.PORT || APP_PORT}`)
})
