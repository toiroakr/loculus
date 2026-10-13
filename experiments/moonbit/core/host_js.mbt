///|
#external
pub type Value

///|
extern "js" fn is_object(value : Value) -> Bool =
  #|v => v !== null && typeof v === "object" && !Array.isArray(v)

///|
extern "js" fn kind(value : Value) -> Int =
  #|v => v === undefined ? 0 : v === null ? 1 : typeof v === "string" ? 2 : typeof v === "number" ? 3 : typeof v === "boolean" ? 4 : Array.isArray(v) ? 5 : 6

///|
extern "js" fn get(value : Value, key : String) -> Value =
  #|(v,k) => Object.hasOwn(v,k) ? v[k] : undefined

///|
extern "js" fn has(value : Value, key : String) -> Bool =
  #|(v,k) => Object.hasOwn(v,k)

///|
extern "js" fn as_string(value : Value) -> String =
  #|v => v

///|
extern "js" fn as_number(value : Value) -> Double =
  #|v => v

///|
extern "js" fn number_value(value : Double) -> Value =
  #|v => v

///|
extern "js" fn bool_value(value : Bool) -> Value =
  #|v => Boolean(v)

///|
extern "js" fn to_number(value : String) -> Double =
  #|v => Number(v)

///|
extern "js" fn length(value : Value) -> Int =
  #|v => v.length

///|
extern "js" fn at(value : Value, index : Int) -> Value =
  #|(v,i) => v[i]

///|
extern "js" fn new_object() -> Value =
  #|() => ({})

///|
extern "js" fn new_array() -> Value =
  #|() => []

///|
extern "js" fn put(value : Value, key : String, item : Value) -> Unit =
  #|(v,k,x) => {if(k === "__proto__") Object.defineProperty(v,k,{value:x,enumerable:true,writable:true,configurable:true}); else v[k]=x}

///|
extern "js" fn push(value : Value, item : Value) -> Unit =
  #|(v,x) => {v.push(x)}

///|
extern "js" fn issue(
  issues : Value,
  key : String,
  index : Int,
  message : String,
) -> Unit =
  #|(v,k,i,m) => {v.push({message:m,...(i === -2 ? {} : {path:i < 0 ? [k] : [k,i]})})}

///|
extern "js" fn finish(output : Value, issues : Value) -> Value =
  #|(v,i) => i.length ? {issues:i} : {value:v}

///|
extern "js" fn cfg_int(config : Value, key : String, fallback : Int) -> Int =
  #|(v,k,f) => v[k] ?? f

///|
extern "js" fn cfg_num(
  config : Value,
  key : String,
  fallback : Double,
) -> Double =
  #|(v,k,f) => v[k] ?? f

///|
extern "js" fn cfg_bool(config : Value, key : String) -> Bool =
  #|(v,k) => Boolean(v[k])
