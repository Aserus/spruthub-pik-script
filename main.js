//--------------- КОНСТАНТЫ НАЧАЛО
const ACCOUNT_PHONE = ""    //формат телефоан +79123456789
const ACCOUNT_PASSWORD = ""

//При наличии
const TOKEN = ""
const DEVICE_UID = ""

const ASSOC_INTERCOM = { }
const ASSOC_METERS = { }
//--------------- КОНСТАНТЫ КОНЕЦ

/////////////////////////////////////////////

//--------------- НАЧАЛО СКРИПТА
const API_AUTH_URL = 'https://intercom.pik-comfort.ru/api/customers/sign_in'
const API_BASEURL = 'https://iot.rubetek.com/api/alfred/v1/'
const API_USERAGENT = 'domophone-ios/230648 CFNetwork/1327.0.4 Darwin/21.2.0'
const API_VERSION = 2
const API_DEVICE_VERSION = '2021.12.1'
const API_DEVICE_OS = 'iOS'
const API_DEVICE_CLIENT = 'alfred'

const generateDeviceUid = function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        let r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
}

function Pik(token, uid){
    this.token = token
    this.uid = uid
}


Pik.fetchToken = function(phone,password){
    if(!phone) throw new Error('Не указан телефон')
    if(!password) throw new Error('Не указан пароль')

    const uid = generateDeviceUid()
    const params = {
        account: { 
            phone: phone, 
            password: password 
        },
        customer_device: { 
            uid: uid
        }
    }

    const response = HttpClient.POST(API_AUTH_URL)
        .header('User-Agent',API_USERAGENT)
        .header('api-version',API_VERSION)
        .header('Content-Type','application/json; charset=utf-8')        
        .body(JSON.stringify(params))
        .send()
        
    if(response.getStatus()!==200) {
        log.error(response.getStatusText())
        throw new Error('Ошибка при получении токена. Возможно неправильный телефон или пароль')
    }
    const headers = response.getHeaders()

    let authorization = headers['Authorization'] || headers['authorization']    
    if(authorization && typeof authorization === 'object' && authorization[0]){
        authorization = authorization[0]
    }    

    if (!authorization) throw new Error('Bad auth')
    const tmp = authorization.split(' ')
    const token = tmp[1] || null
    if(!token) throw new Error('Token is null')
    return { 
        token: token,
        uid: uid
    }
}

Pik.prototype.generateHeaders = function(){
    if (!this.token) throw new Error('PIK. Не указан token')
    if (!this.uid) throw new Error('PIK. Не указан device uid')
    return {
        'authorization': this.token,
        'device-client-app': API_DEVICE_CLIENT,
        'api-version': API_VERSION,
        'accept-language': 'ru',
        'device-client-uid': this.uid,
        'user-agent': API_USERAGENT,
        'device-client-version': API_DEVICE_VERSION,
        'device-client-os': API_DEVICE_OS
    }
}

Pik.prototype.apiRequest = function(method,path){
    const url = API_BASEURL + path
    let request = HttpClient[method](url)   
    const headers = this.generateHeaders()
    for(let key in headers){
        request = request.header(key,headers[key])        
    }
    return request.send()
}

Pik.prototype.intercomOpenById = function(intercomId) {    
    const response = this.apiRequest('POST','personal/relays/'+intercomId+'/unlock')
    if(response.getStatus() !== 200) throw new Error('Ошибка при открытии двери')
    return true
}

Pik.prototype.meterList = function() {
    const response = this.apiRequest('GET','personal/meters')
    if(response.getStatus() !== 200) throw new Error('Ошибка при получении счетчиков')
    const list= JSON.parse(response.getBody())
    return list
}

Pik.prototype.intercomList = function() {
    const response = this.apiRequest('GET','personal/intercoms?page=1')
    if(response.getStatus() !== 200) throw new Error('Ошибка при получении домофонов')
    const list= JSON.parse(response.getBody())
    return list
}

Pik.prototype.intercomOpen = function(name){
    const intercomId = ASSOC_INTERCOM ? ASSOC_INTERCOM[name] : null
    if(!intercomId) throw new Error('Не найден ID двери')
    return this.intercomOpenById(intercomId)
}

Pik.prototype.updateMeters = function(){
    this.meterList().forEach(function(meter){
        const item = ASSOC_METERS[meter.id]
        if(!item) return;
        if(!item.aid || !item.cid) throw new Error('Счетчики не привязаны')
        const value = parseFloat(meter.current_value.split(' ')[0])
        Hub.setCharacteristicValue(item.aid,item.cid,value)
    })
}

const start = function (phone,password){
    if(TOKEN) throw new Error('У вас уже указан токен - закомментируйте строчку start("телефон","пароль") или укажите TOKEN = false')
    const data = Pik.fetchToken(phone,password)

    const tmpPik = new Pik(data.token,data.uid)


    const list = tmpPik.intercomList()
        .filter(function(item){
            return item.relays && item.relays.length
        })
        .map(function(intercom) {
            const item = intercom.relays[0]
            const name = item.name
            const customName = (item.user_settings && item.user_settings.custom_name) ? item.user_settings.custom_name : ''
            return {
                id: item.id,
                name: name,
                customName: customName
            }
        })
  
    const arr = [
        '//--------------- КОНСТАНТЫ НАЧАЛО',
        'const ACCOUNT_PHONE = ""\t//формат телефоан +79123456789',
        'const ACCOUNT_PASSWORD = ""',,

        '//При наличии',
        'const TOKEN = "'+data.token+'"',
        'const DEVICE_UID = "'+data.uid+'"',
        '',
        'const ASSOC_INTERCOM = {',
    ]

    list.forEach(function(item,i){
        arr.push('\t"УДОБНОЕ_НАЗВАНИЕ_'+(i+1)+'" : '+item.id+',\t// '+item.customName+' // '+item.name)
    })
    arr.push('}')

    arr.push('const ASSOC_METERS = {')

    tmpPik.meterList().forEach(function(meter){
        arr.push('\t"'+meter.id+'" : { aid: 0, cid:0 },\t// '+meter.title+' // '+meter.geo_unit_short_name)
    })
    arr.push('}','//--------------- КОНСТАНТЫ КОНЕЦ')

    log.info('\n\n'+arr.join('\n')+'\n\n')

    log.warn('Скачайте логи на компьютер откройте и скопируйте из секции //--- КОНСТАНТЫ') 

}

pik = new Pik(TOKEN,DEVICE_UID)

//--------------- КОНЕЦ СКРИПТА

if(!TOKEN && ACCOUNT_PHONE){
    start(ACCOUNT_PHONE,ACCOUNT_PASSWORD)
}

if(TOKEN && Object.keys(ASSOC_METERS).length > 0){
    Cron.schedule('* */50 * * * *', function(){
        pik.updateMeters()
    });
    pik.updateMeters()
}
