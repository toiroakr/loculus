///|
pub(all) struct Field {
  key : String
  kind : Int
  min : Int
  max : Int
  optional : Bool
  nullable : Bool
  fallback : Value
  null_fallback : Value
  has_null_fallback : Bool
  integer : Bool
  lower : Double
  upper : Double
  lower_open : Bool
  upper_open : Bool
  values : Array[String]
  wrap_scalar : Bool
}

///|
#export_name("compile_schema")
pub fn compile_schema(config : Value) -> Array[Field] {
  Array::makei(length(config), i => {
    let c = at(config, i)
    let values = get(c, "values")
    {
      key: as_string(get(c, "key")),
      kind: cfg_int(c, "kind", 0),
      min: cfg_int(c, "min", 0),
      max: cfg_int(c, "max", 2147483647),
      optional: cfg_bool(c, "optional") || cfg_bool(c, "nullish"),
      nullable: cfg_bool(c, "nullable") || cfg_bool(c, "nullish"),
      fallback: get(c, "fallback"),
      null_fallback: get(c, "nullFallback"),
      has_null_fallback: has(c, "nullFallback"),
      integer: cfg_bool(c, "integer"),
      lower: cfg_num(c, "gt", cfg_num(c, "gte", -1.0 / 0.0)),
      upper: cfg_num(c, "lt", cfg_num(c, "lte", 1.0 / 0.0)),
      lower_open: has(c, "gt"),
      upper_open: has(c, "lt"),
      values: if kind(values) == 5 {
        Array::makei(length(values), j => as_string(at(values, j)))
      } else {
        []
      },
      wrap_scalar: !has(c, "wrapScalar") || cfg_bool(c, "wrapScalar"),
    }
  })
}

///|
fn digit(code : UInt16) -> Bool {
  code >= 48 && code <= 57
}

///|
#export_name("decimal")
pub fn decimal(text : String) -> Bool {
  let n = text.length()
  if n == 0 {
    return false
  }
  let mut i = 0
  if text[i] == 43 || text[i] == 45 {
    i += 1
  }
  let begin = i
  while i < n && digit(text[i]) {
    i += 1
  }
  let mut digits = i - begin
  if i < n && text[i] == 46 {
    i += 1
    let start = i
    while i < n && digit(text[i]) {
      i += 1
    }
    digits += i - start
  }
  if digits == 0 {
    return false
  }
  if i < n && (text[i] == 69 || text[i] == 101) {
    i += 1
    if i < n && (text[i] == 43 || text[i] == 45) {
      i += 1
    }
    let start = i
    while i < n && digit(text[i]) {
      i += 1
    }
    if i == start {
      return false
    }
  }
  i == n
}

///|
fn parse_field(field : Field, input : Value, issues : Value) -> Value {
  let input_kind = kind(input)
  if input_kind == 0 {
    if kind(field.fallback) != 0 {
      return field.fallback
    }
    if field.optional {
      return input
    }
    if field.kind != 4 || !field.wrap_scalar {
      issue(issues, field.key, -1, "Required field")
      return input
    }
  }
  if input_kind == 1 {
    if field.has_null_fallback {
      return field.null_fallback
    }
    if field.nullable {
      return input
    }
    if field.kind != 4 || !field.wrap_scalar {
      issue(issues, field.key, -1, "Null is not allowed")
      return input
    }
  }
  match field.kind {
    0 =>
      if input_kind == 2 {
        let size = as_string(input).length()
        if size >= field.min && size <= field.max {
          return input
        }
      }
    1 => {
      let number = if input_kind == 3 {
        as_number(input)
      } else if input_kind == 2 && decimal(as_string(input)) {
        to_number(as_string(input))
      } else {
        0.0 / 0.0
      }
      if !number.is_nan() &&
        !number.is_inf() &&
        (
          !field.integer ||
          (number.trunc() == number && number.abs() <= 9007199254740991.0)
        ) &&
        (if field.lower_open {
          number > field.lower
        } else {
          number >= field.lower
        }) &&
        (if field.upper_open {
          number < field.upper
        } else {
          number <= field.upper
        }) {
        return number_value(number)
      }
    }
    2 => {
      if input_kind == 4 {
        return input
      }
      if input_kind == 2 {
        match as_string(input) {
          "true" | "1" => return bool_value(true)
          "false" | "0" => return bool_value(false)
          _ => ()
        }
      }
    }
    3 =>
      if input_kind == 2 && field.values.contains(as_string(input)) {
        return input
      }
    4 =>
      if input_kind == 5 || field.wrap_scalar {
        let count = if input_kind == 5 { length(input) } else { 1 }
        let output = new_array()
        for i in 0..<count {
          let value = if input_kind == 5 { at(input, i) } else { input }
          if kind(value) == 2 {
            push(output, value)
          } else {
            issue(issues, field.key, i, "Expected string")
          }
        }
        if count >= field.min && count <= field.max {
          return output
        }
      }
    _ => ()
  }
  issue(issues, field.key, -1, "Invalid field")
  input
}

///|
#export_name("validate")
pub fn validate(fields : Array[Field], input : Value) -> Value {
  let output = new_object()
  let issues = new_array()
  if !is_object(input) {
    issue(issues, "", -2, "Expected object")
  } else {
    for field in fields {
      let raw = get(input, field.key)
      let value = parse_field(field, raw, issues)
      if kind(value) != 0 || has(input, field.key) {
        put(output, field.key, value)
      }
    }
  }
  finish(output, issues)
}
