const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express()

app.use(express.json())

const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')
let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server is running on http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

initializeDBAndServer()

const convertDbObjTOResponseObj = eachState => {
  return {
    stateId: eachState.state_id,
    stateName: eachState.state_name,
    population: eachState.population,
  }
}

const convertDistrictObjToResponseObject = eachDistrict => {
  return {
    districtId: eachDistrict.district_id,
    districtName: eachDistrict.district_name,
    stateId: eachDistrict.state_id,
    cases: eachDistrict.cases,
    cured: eachDistrict.cured,
    active: eachDistrict.active,
    deaths: eachDistrict.deaths,
  }
}

const authentication = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (authHeader === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'SECRET_TOKEN', (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const user = `
  select * from user where username = '${username}'`
  const dbUser = await db.get(user)

  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordValid = await bcrypt.compare(password, dbUser.password)
    if (isPasswordValid === true) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

app.get('/states/', authentication, async (request, response) => {
  const getStates = `
  select * from state`
  const statesArray = await db.all(getStates)
  response.send(
    statesArray.map(eachState => convertDbObjTOResponseObj(eachState)),
  )
})

app.get('/states/:stateId/', authentication, async (request, response) => {
  const {stateId} = request.params
  const getStateQuery = `SELECT * FROM state WHERE state_id = ${stateId}`
  const state = await db.get(getStateQuery)
  response.send(convertDbObjTOResponseObj(state))
})

app.post('/districts/', authentication, async (request, response) => {
  const {districtName, stateId, cases, cured, active, deaths} = request.body
  const addDistrict = `
  insert into district (district_name, state_id, cases, cured, active, deaths)
  values (
    '${districtName}',
    ${stateId},
    ${cases},
    ${cured},
    ${active},
    ${deaths}
  )`
  await db.run(addDistrict)
  response.send('District Successfully Added')
})

app.get(
  '/districts/:districtId/',
  authentication,
  async (request, response) => {
    const {districtId} = request.params
    const getDistrict = `
    select * from district where district_id = ${districtId}`

    const district = await db.get(getDistrict)
    response.send(convertDistrictObjToResponseObject(district))
  },
)

app.delete(
  '/districts/:districtId/',
  authentication,
  async (request, response) => {
    const {districtId} = request.params
    const deleteDistrict = `
    delete from district where district_id = ${districtId}`

    const district = await db.run(deleteDistrict)
    response.send('District Removed')
  },
)

app.put(
  '/districts/:districtId/',
  authentication,
  async (request, response) => {
    const {districtId} = request.params
    const {districtName, stateId, cases, cured, active, deaths} = request.body

    const updateDistrict = `
    update district
    set 
    district_name = '${districtName}',
    state_id = ${stateId},
    cases = ${cases},
    cured = ${cured},
    active = ${active},
    deaths = ${deaths}
    where district_id = ${districtId}
    `
    const district = await db.run(updateDistrict)
    response.send('District Details Updated')
  },
)

app.get(
  '/states/:stateId/stats/',
  authentication,
  async (request, response) => {
    const convertDetailsObjToResponseObject = dbObject => {
      return {
        totalCases: dbObject.totalCases,
        totalCured: dbObject.cured,
        totalActive: dbObject.active,
        totalDeaths: dbObject.deaths,
      }
    }

    const {stateId} = request.params
    const stats = `
    select 
    sum(cases) as totalCases,
    sum(cured) as cured,
    sum(active) as active,
    sum(deaths) as deaths from 
    district where state_id = ${stateId}`

    const details = await db.get(stats)
    response.send(convertDetailsObjToResponseObject(details))
  },
)

module.exports = app
