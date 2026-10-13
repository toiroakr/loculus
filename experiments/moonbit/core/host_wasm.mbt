///|
#external
pub type Value

///|
fn is_object(value : Value) -> Bool = "host" "is_object"

///|
fn kind(value : Value) -> Int = "host" "kind"

///|
fn get(value : Value, key : String) -> Value = "host" "get"

///|
fn has(value : Value, key : String) -> Bool = "host" "has"

///|
fn as_string(value : Value) -> String = "host" "as_string"

///|
fn as_number(value : Value) -> Double = "host" "as_number"

///|
fn number_value(value : Double) -> Value = "host" "number_value"

///|
fn bool_value(value : Bool) -> Value = "host" "bool_value"

///|
fn to_number(value : String) -> Double = "host" "to_number"

///|
fn length(value : Value) -> Int = "host" "length"

///|
fn at(value : Value, index : Int) -> Value = "host" "at"

///|
fn new_object() -> Value = "host" "new_object"

///|
fn new_array() -> Value = "host" "new_array"

///|
fn put(value : Value, key : String, item : Value) -> Unit = "host" "put"

///|
fn push(value : Value, item : Value) -> Unit = "host" "push"

///|
fn issue(issues : Value, key : String, index : Int, message : String) -> Unit = "host" "issue"

///|
fn finish(output : Value, issues : Value) -> Value = "host" "finish"

///|
fn cfg_int(config : Value, key : String, fallback : Int) -> Int = "host" "cfg_int"

///|
fn cfg_num(config : Value, key : String, fallback : Double) -> Double = "host" "cfg_num"

///|
fn cfg_bool(config : Value, key : String) -> Bool = "host" "cfg_bool"
