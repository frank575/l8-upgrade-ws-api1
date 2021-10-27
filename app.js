const dateFormat = require('dateformat')
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

const createContentAndMatches = (indexMap, contents) => {
	return {
		contents,
		matches: contents.filter((_, i) => indexMap[i] != null).map(e => e.id),
	}
}

let startTime = Date.now()
const K = 1
const QUESTIONS = [
	{
		id: questionId++,
		title: '信箱',
		description:
			'@前只能是【英/數/./_字符且首字為英文】，@後必須為【英文.英文】的格式',
		...createContentAndMatches({ 2: K, 7: K, 8: K }, [
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
	{
		id: questionId++,
		title: '數字範圍',
		description: '數字 3 - 6 位數',
		...createContentAndMatches({ 0: K }, [
			{ id: questionId++, name: '123456' },
		]),
	},
]
const dateFormatMask = 'yyyy-mm-dd HH:MM:ss'
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
	answer: ['answer', '送出回答'],
	message: ['message', '送出文字'],
	giveUp: ['giveUp', '放棄'],
}
const IO_EMIT_TYPE = {
	JOIN: ['JOIN', '連接成功'],
	OVER_THEN_RESTART: ['OVER_THEN_RESTART', '遊戲結束，請重新開始'],
	PONG: ['PONG', '乓'],
	BLESS_YOU: ['BLESS_YOU', '祝福你'],
	MESSAGE: ['MESSAGE', '訊息'],
	GIVE_UP: ['GIVE_UP', '放棄'],
	ANSWER: ['ANSWER', '回答'],
}
const BLESS_TYPE = {
	GOOD: ['GOOD', '讚'],
	BAD: ['BAD', '倒讚'],
}
const SCORE_MAP = {
	ANSWER_CORRECT: 10,
	ANSWER_ERROR: -4,
	GIVE_UP: -10,
}
let userNotFoundNum = 0
let current = 0
let userMap = {}
let onlineUserSocketIdMap = {}
let messages = []

// const commonResponse = {
// 	type, ranks?,
// }

const nextCurrent = () => {
	if (current < QUESTIONS.length - 1) {
		return current++
	}
	current = 0
}

const getQuestion = (next = false) => {
	if (next) nextCurrent()
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

const sendMessageToAll = event => {
	io.sockets.emit(IO_EMIT_EVENT_NAME.messages[0], event)
}

const sendMessageToSomeone = (socket, socketId, event) => {
	if (socket == null || socketId == null) return
	socket.broadcast.to(socketId).emit(IO_EMIT_EVENT_NAME.messages[0], event)
}

const restart = () => {
	const ranks = getUsers()
		.sort((a, b) => b.score - a.score)
		.splice(0, 3)

	startTime = Date.now()

	const _userMap = {}
	for (const userId in onlineUserSocketIdMap) {
		_userMap[userId] = userMap[userId]
	}
	userMap = _userMap
	messages = []
	current = 0

	sendMessageToAll({
		type: IO_EMIT_TYPE.OVER_THEN_RESTART[0],
		message: IO_EMIT_TYPE.OVER_THEN_RESTART[1],
		users: getUsers(),
		question: getQuestion(),
		messages: [],
		ranks,
		dateTime: dateFormat(new Date(startTime), dateFormatMask),
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
		id: userId,
		name,
		score: 0,
	}
	userMap[userId] = user
	return user
}

const getScoreString = score => {
	if (score > 0) {
		return `+${score}`
	} else if (score < 0) {
		return `${score}`
	} else {
		return '0'
	}
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
					id: userId,
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
	const connectMessage = {
		id: uuidv4(),
		type: IO_EMIT_TYPE.JOIN[0],
		message: `${user.name} 加入了房間`,
		dateTime: dateFormat(new Date(), dateFormatMask),
	}
	messages.push(connectMessage)
	sendMessageToAll(connectMessage)

	socket.emit(IO_EMIT_EVENT_NAME.connection[0], {
		type: IO_EMIT_TYPE.JOIN[0],
		message: IO_EMIT_TYPE.JOIN[1],
		user,
		users: getUsers(),
		question: getQuestion(),
		messages,
		startDateTime: dateFormat(new Date(startTime), dateFormatMask),
	})

	socket.on(IO_ON_EVENT_NAME.restart[0], restart)

	socket.on(IO_ON_EVENT_NAME.ping[0], () => {
		console.log(`ping with ${user.name}`)
		socket.emit(IO_EMIT_EVENT_NAME.ping[0], {
			type: IO_EMIT_TYPE.PONG[0],
			message: IO_EMIT_TYPE.PONG[1],
		})
	})

	socket.on(IO_ON_EVENT_NAME.bless[0], msg => {
		if (msg == null) return
		try {
			const { type, userId } = msg
			if (type !== BLESS_TYPE.BAD[0] && type !== BLESS_TYPE.GOOD[0]) {
				throw new Error('請給正確的 type')
			}
			const dateTime = dateFormat(new Date(), dateFormatMask)
			const commonMessage = {
				id: uuidv4(),
				type: IO_EMIT_TYPE.BLESS_YOU[0],
				blessType: type,
				dateTime,
			}
			messages.push({
				...commonMessage,
				message: `${user.name} 給 ${userMap[userId]?.name} 倒讚`,
			})
			sendMessageToAll({
				...commonMessage,
				message: `${user.name} 給 ${userMap[userId]?.name} 倒讚`,
			})
			const socketId = onlineUserSocketIdMap[userId]
			if (socketId != null) {
				sendMessageToSomeone(socket, socketId, {
					...commonMessage,
					message: `來自 ${user.name} 的祝福`,
				})
			}
		} catch (error) {
			console.error(error)
		}
	})

	socket.on(IO_ON_EVENT_NAME.answer[0], regexString => {
		if (regexString == null || typeof regexString != 'string') return
		const regex = new RegExp(regexString)
		const { matches, contents } = getQuestion()

		const matchesMap = {}
		matches.forEach(id => {
			matchesMap[id] = 1
		})

		let pass = true
		for (let i = 0; i < contents.length; i++) {
			const e = contents[i]
			if (matchesMap[e.id] == null) {
				if (regex.test(e.name)) {
					pass = false
					break
				}
			} else {
				if (!regex.test(e.name)) {
					pass = false
					break
				}
			}
		}

		const dateTime = dateFormat(new Date(), dateFormatMask)
		const score = pass ? SCORE_MAP.ANSWER_CORRECT : SCORE_MAP.ANSWER_ERROR
		const commonMessage = {
			id: uuidv4(),
			type: IO_EMIT_TYPE.ANSWER[0],
			pass,
			message: `${user.name} 作答${pass ? '正確' : '錯誤'} ${getScoreString(
				score,
			)}`,
			dateTime,
			userId,
			score,
		}
		if (userMap[userId]) {
			userMap[userId].score += score
		}
		messages.push(commonMessage)
		sendMessageToAll({
			...commonMessage,
			newQuestion: pass ? getQuestion(true) : null,
		})
	})

	socket.on(IO_ON_EVENT_NAME.message[0], message => {
		if (
			message == null ||
			typeof message !== 'string' ||
			message.trim().length === 0
		)
			return
		const dateTime = dateFormat(new Date(), dateFormatMask)
		const commonMessage = {
			id: uuidv4(),
			type: IO_EMIT_TYPE.MESSAGE[0],
			message,
			dateTime,
		}
		messages.push(commonMessage)
		sendMessageToAll(commonMessage)
	})

	socket.on(IO_ON_EVENT_NAME.giveUp[0], () => {
		const dateTime = dateFormat(new Date(), dateFormatMask)
		const score = SCORE_MAP.GIVE_UP
		const commonMessage = {
			id: uuidv4(),
			type: IO_EMIT_TYPE.GIVE_UP[0],
			message: `${user.name} 放棄了題目 ${getScoreString(score)}`,
			dateTime,
			userId,
			score,
		}
		if (userMap[userId]) {
			userMap[userId].score += score
		}
		messages.push(commonMessage)
		sendMessageToAll({ ...commonMessage, newQuestion: getQuestion(true) })
	})

	socket.on(IO_ON_EVENT_NAME.disconnect[0], () => {
		console.log(`user: ${user.name} disconnected`)
		const connectMessage = {
			id: uuidv4(),
			type: IO_EMIT_TYPE.JOIN[0],
			message: `${user.name} 離開了房間`,
			dateTime: dateFormat(new Date(), dateFormatMask),
		}
		messages.push(connectMessage)
		sendMessageToAll(connectMessage)

		delete onlineUserSocketIdMap[userId]
	})
})

server.listen(process.env.PORT || APP_PORT, () => {
	console.log(`listening on *:${process.env.PORT || APP_PORT}`)
})
