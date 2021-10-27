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

const IO_EMIT_EVENT_NAME = {
	connection: ['connection', '連線成功'],
	messages: ['messages', '發送信息'],
	ping: ['ping', '乒乓'],
}
const IO_ON_EVENT_NAME = {
	connection: ['connection', '連線開始'],
	disconnect: ['disconnect', '斷開連線'],
	restart: ['restart', '重新開始'],
	ping: ['ping', '乒乓'],
	bless: ['bless', '讚與倒讚'],
}
const IO_EMIT_TYPE = {
	JOIN: ['JOIN', '連接成功'],
	OVER_THEN_RESTART: ['OVER_THEN_RESTART', '遊戲結束，請重新開始'],
	PONG: ['PONG', '乓'],
}
let userNotFoundNum = 0
let current = 0
let userMap = {}
let onlineUserSocketIdMap = {}
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
		const { ...otherInfo } = userMap[id]
		return {
			...otherInfo,
			id,
			online: onlineUserSocketIdMap[id] != null,
		}
	})

const restart = () => {
	const ranks = getUsers()
		.sort(e => e.score)
		.splice(0, 3)

	startTime = Date.now()

	const _userMap = {}
	for (const userId in onlineUserSocketIdMap) {
		_userMap[userId] = userMap[userId]
	}
	userMap = _userMap
	messages = []
	current = 0

	io.sockets.emit(IO_EMIT_EVENT_NAME.messages[0], {
		type: IO_EMIT_TYPE.OVER_THEN_RESTART[0],
		message: IO_EMIT_TYPE.OVER_THEN_RESTART[1],
		users: getUsers(),
		question: getQuestion(),
		messages: [],
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
}, 1000)

const { v4: uuidv4 } = require('uuid')

const getNotFoundUser = (userId, _name) => {
	const name = _name ? _name : `匿名者${++userNotFoundNum}`
	const user = {
		name,
		score: 0,
	}
	userMap[userId] = user
	return user
}

io.on(IO_ON_EVENT_NAME.connection[0], socket => {
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
					score: 0,
				}
				userMap[userId] = user
			} else {
				if (userMap[id] == null) {
					if (name == null) {
						throw new Error('找不到使用者')
					} else {
						userId = uuidv4()
						user = getNotFoundUser(userId, name)
					}
				} else {
					userId = id
					user = userMap[userId]
				}
			}
		} catch (err) {
			console.error(err)
			userId = uuidv4()
			user = getNotFoundUser(userId)
		}
	} else {
		userId = uuidv4()
		user = getNotFoundUser(userId)
	}
	onlineUserSocketIdMap[userId] = socketId
	console.log(`user: ${user.name} connection`)

	socket.emit(IO_EMIT_EVENT_NAME.connection[0], {
		type: IO_EMIT_TYPE.JOIN[0],
		message: IO_EMIT_TYPE.JOIN[1],
		user,
		users: getUsers(),
		question: getQuestion(),
		messages,
	})

	socket.on(IO_ON_EVENT_NAME.restart[0], restart)

	socket.on(IO_ON_EVENT_NAME.ping[0], () => {
		console.log(`ping with ${user.name}`)
		socket.emit(IO_EMIT_EVENT_NAME.ping[0], {
			type: IO_EMIT_TYPE.PONG[0],
			message: IO_EMIT_TYPE.PONG[1],
		})
	})

	socket.on(IO_ON_EVENT_NAME.bless[0], restart)

	// 私發
	// socket.broadcast.to(socketid).emit(IO_EMIT_EVENT_NAME.messages[0], 'for your eyes only');

	// 斷線處理
	socket.on(IO_ON_EVENT_NAME.disconnect[0], () => {
		console.log(`user: ${user.name} disconnected`)
		delete onlineUserSocketIdMap[userId]
	})
})

server.listen(process.env.PORT || APP_PORT, () => {
	console.log(`listening on *:${process.env.PORT || APP_PORT}`)
})
