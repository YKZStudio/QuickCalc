use std::collections::HashMap;

use chrono::{Local, TimeZone, Utc};

use crate::model::{is_builtin, ValueKind};

const MAX_EXPRESSION_CHARS: usize = 4096;

#[derive(Debug, Clone, PartialEq)]
enum Token {
    Number(f64),
    Ident(String),
    Plus,
    Minus,
    Star,
    Slash,
    Percent,
    Power,
    Ampersand,
    Pipe,
    Xor,
    ShiftLeft,
    ShiftRight,
    Tilde,
    Sqrt,
    LeftParen,
    RightParen,
    Comma,
    End,
}

#[derive(Debug, Clone)]
pub struct EvaluatorOutput {
    pub value: Option<f64>,
    pub value_kind: ValueKind,
    pub display: String,
    pub assigned_variable: Option<String>,
}

#[derive(Debug, Clone, Copy)]
struct Value {
    number: f64,
    kind: ValueKind,
}

impl Value {
    fn number(number: f64) -> Self {
        Self {
            number,
            kind: ValueKind::Number,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Conversion {
    Base(String),
    Ascii,
    ToString,
}

pub struct Evaluator<'a> {
    variables: &'a HashMap<String, f64>,
    variable_kinds: &'a HashMap<String, ValueKind>,
    res: f64,
    res_kind: ValueKind,
}

impl<'a> Evaluator<'a> {
    pub fn new(
        variables: &'a HashMap<String, f64>,
        variable_kinds: &'a HashMap<String, ValueKind>,
        res: f64,
        res_kind: ValueKind,
    ) -> Self {
        Self {
            variables,
            variable_kinds,
            res,
            res_kind,
        }
    }

    pub fn evaluate(&self, raw_expression: &str) -> Result<EvaluatorOutput, String> {
        if raw_expression.chars().count() > MAX_EXPRESSION_CHARS {
            return Err(format!("表达式不能超过 {MAX_EXPRESSION_CHARS} 个字符"));
        }

        let normalized = normalize_expression(raw_expression);
        let (assigned_variable, right_hand_side) = split_assignment(&normalized)?;
        if let Some(name) = &assigned_variable {
            if is_builtin(name) {
                return Err(format!("内置变量 {name} 是只读的"));
            }
        }

        let (numeric_expression, conversion) = split_conversion(&right_hand_side)?;
        if matches!(
            conversion.as_ref(),
            Some(Conversion::Ascii | Conversion::ToString)
        ) {
            if assigned_variable.is_some() {
                return Err("字符转换结果不能赋值给数值变量".to_owned());
            }
            let display = match conversion {
                Some(Conversion::Ascii) => convert_to_ascii_codes(&numeric_expression)?,
                Some(Conversion::ToString) => convert_ascii_codes_to_string(&numeric_expression)?,
                _ => unreachable!("conversion was checked above"),
            };
            return Ok(EvaluatorOutput {
                value: None,
                value_kind: ValueKind::Number,
                display,
                assigned_variable: None,
            });
        }

        let tokens = tokenize(&numeric_expression)?;
        let mut parser = Parser::new(
            tokens,
            self.variables,
            self.variable_kinds,
            self.res,
            self.res_kind,
        );
        let value = parser.parse()?;
        ensure_finite(value.number)?;

        let display = match conversion.as_ref() {
            Some(Conversion::Base(base)) => format_in_base(value.number, base)?,
            Some(Conversion::Ascii | Conversion::ToString) => {
                unreachable!("text conversions returned above")
            }
            None => format_value(value)?,
        };

        Ok(EvaluatorOutput {
            value: Some(value.number),
            value_kind: value.kind,
            display,
            assigned_variable,
        })
    }
}

fn normalize_expression(expression: &str) -> String {
    let mut normalized = String::with_capacity(expression.len());

    for character in expression.trim().chars() {
        if character == 'π' {
            normalized.push_str("pi");
            continue;
        }

        let character = match character {
            '！'..='～' => char::from_u32(character as u32 - 0xfee0).unwrap_or(character),
            '　' => ' ',
            '。' => '.',
            '、' => ',',
            '【' | '〔' | '〖' | '﹝' => '[',
            '】' | '〕' | '〗' | '﹞' => ']',
            '﹙' => '(',
            '﹚' => ')',
            '﹛' => '{',
            '﹜' => '}',
            '×' | '✕' | '✖' => '*',
            '÷' => '/',
            '−' | '–' | '—' => '-',
            other => other,
        };

        normalized.push(match character {
            '[' | '{' => '(',
            ']' | '}' => ')',
            other => other,
        });
    }

    normalized
}

fn split_assignment(expression: &str) -> Result<(Option<String>, String), String> {
    let mut depth = 0_i32;
    let mut assignment_index = None;

    for (index, character) in expression.char_indices() {
        match character {
            '(' => depth += 1,
            ')' => depth -= 1,
            '=' if depth == 0 => {
                if assignment_index.replace(index).is_some() {
                    return Err("一次只能进行一个变量赋值".to_owned());
                }
            }
            _ => {}
        }
    }

    let Some(index) = assignment_index else {
        return Ok((None, expression.to_owned()));
    };

    let name = expression[..index].trim().to_ascii_lowercase();
    if !is_valid_identifier(&name) {
        return Err("等号左侧必须是有效变量名".to_owned());
    }
    let value_expression = expression[index + 1..].trim();
    if value_expression.is_empty() {
        return Err("变量赋值缺少右侧表达式".to_owned());
    }

    Ok((Some(name), value_expression.to_owned()))
}

fn split_conversion(expression: &str) -> Result<(String, Option<Conversion>), String> {
    let expression = expression.trim();
    let lowercase = expression.to_ascii_lowercase();

    for target in ["bin", "oct", "dec", "hex"] {
        let suffix = format!(".{target}");
        if lowercase.ends_with(&suffix) {
            let numeric_expression = expression[..expression.len() - suffix.len()].trim();
            if numeric_expression.is_empty() {
                return Err("进制转换缺少源表达式".to_owned());
            }
            return Ok((
                numeric_expression.to_owned(),
                Some(Conversion::Base(target.to_owned())),
            ));
        }
    }

    for (target, conversion) in [
        ("ascii", Conversion::Ascii),
        ("tostr", Conversion::ToString),
    ] {
        let suffix = format!(".{target}");
        if lowercase.ends_with(&suffix) {
            let source = expression[..expression.len() - suffix.len()].trim();
            if source.is_empty() {
                return Err("字符转换缺少源内容".to_owned());
            }
            return Ok((source.to_owned(), Some(conversion)));
        }
    }

    if expression.contains("->") {
        return Err("进制转换请使用“源表达式.进制”，例如 255.hex".to_owned());
    }

    Ok((expression.to_owned(), None))
}

fn is_valid_identifier(name: &str) -> bool {
    let mut characters = name.chars();
    let Some(first) = characters.next() else {
        return false;
    };
    (first.is_ascii_alphabetic() || first == '_')
        && characters.all(|character| character.is_ascii_alphanumeric() || character == '_')
}

fn tokenize(expression: &str) -> Result<Vec<Token>, String> {
    let characters: Vec<char> = expression.chars().collect();
    let mut tokens = Vec::new();
    let mut index = 0_usize;

    while index < characters.len() {
        let character = characters[index];
        if character.is_whitespace() {
            index += 1;
            continue;
        }

        if character.is_ascii_digit() || character == '.' {
            let (value, next_index) = scan_number(&characters, index)?;
            tokens.push(Token::Number(value));
            index = next_index;
            continue;
        }

        if character.is_ascii_alphabetic() || character == '_' {
            let start = index;
            index += 1;
            while index < characters.len()
                && (characters[index].is_ascii_alphanumeric() || characters[index] == '_')
            {
                index += 1;
            }
            let identifier: String = characters[start..index]
                .iter()
                .collect::<String>()
                .to_ascii_lowercase();
            if identifier == "xor" {
                tokens.push(Token::Xor);
            } else {
                tokens.push(Token::Ident(identifier));
            }
            continue;
        }

        match character {
            '+' => tokens.push(Token::Plus),
            '-' => tokens.push(Token::Minus),
            '*' if characters.get(index + 1) == Some(&'*') => {
                tokens.push(Token::Power);
                index += 1;
            }
            '*' => tokens.push(Token::Star),
            '/' => tokens.push(Token::Slash),
            '%' => tokens.push(Token::Percent),
            '^' => tokens.push(Token::Xor),
            '&' => tokens.push(Token::Ampersand),
            '|' => tokens.push(Token::Pipe),
            '~' => tokens.push(Token::Tilde),
            '√' => tokens.push(Token::Sqrt),
            '<' if characters.get(index + 1) == Some(&'<') => {
                tokens.push(Token::ShiftLeft);
                index += 1;
            }
            '>' if characters.get(index + 1) == Some(&'>') => {
                tokens.push(Token::ShiftRight);
                index += 1;
            }
            '(' => tokens.push(Token::LeftParen),
            ')' => tokens.push(Token::RightParen),
            ',' => tokens.push(Token::Comma),
            _ => return Err(format!("无法识别第 {} 个字符：{character}", index + 1)),
        }
        index += 1;
    }

    tokens.push(Token::End);
    Ok(tokens)
}

fn scan_number(characters: &[char], start: usize) -> Result<(f64, usize), String> {
    if characters[start] == '0' {
        if let Some(prefix) = characters.get(start + 1).copied() {
            let radix = match prefix {
                'b' | 'B' => Some(2),
                'o' | 'O' => Some(8),
                'x' | 'X' => Some(16),
                _ => None,
            };
            if let Some(radix) = radix {
                let mut index = start + 2;
                let digit_start = index;
                while index < characters.len()
                    && (characters[index].is_digit(radix) || characters[index] == '_')
                {
                    index += 1;
                }
                let digits: String = characters[digit_start..index]
                    .iter()
                    .filter(|character| **character != '_')
                    .collect();
                if digits.is_empty() {
                    return Err(format!("第 {} 个字符处的进制数字不完整", start + 1));
                }
                let value = i64::from_str_radix(&digits, radix)
                    .map_err(|_| format!("第 {} 个字符处的整数超出 64 位范围", start + 1))?;
                return Ok((value as f64, index));
            }
        }
    }

    let mut index = start;
    let mut seen_dot = false;
    let mut seen_exponent = false;
    while index < characters.len() {
        match characters[index] {
            character if character.is_ascii_digit() || character == '_' => index += 1,
            '.' if !seen_dot && !seen_exponent => {
                seen_dot = true;
                index += 1;
            }
            'e' | 'E' if !seen_exponent => {
                seen_exponent = true;
                index += 1;
                if matches!(characters.get(index), Some('+' | '-')) {
                    index += 1;
                }
            }
            _ => break,
        }
    }

    let literal: String = characters[start..index]
        .iter()
        .filter(|character| **character != '_')
        .collect();
    let value = literal
        .parse::<f64>()
        .map_err(|_| format!("第 {} 个字符处的数字无效", start + 1))?;
    ensure_finite(value)?;
    Ok((value, index))
}

struct Parser<'a> {
    tokens: Vec<Token>,
    position: usize,
    variables: &'a HashMap<String, f64>,
    variable_kinds: &'a HashMap<String, ValueKind>,
    res: f64,
    res_kind: ValueKind,
    now_timestamp: f64,
}

impl<'a> Parser<'a> {
    fn new(
        tokens: Vec<Token>,
        variables: &'a HashMap<String, f64>,
        variable_kinds: &'a HashMap<String, ValueKind>,
        res: f64,
        res_kind: ValueKind,
    ) -> Self {
        Self {
            tokens,
            position: 0,
            variables,
            variable_kinds,
            res,
            res_kind,
            now_timestamp: Utc::now().timestamp() as f64,
        }
    }

    fn parse(&mut self) -> Result<Value, String> {
        let value = self.parse_bit_or()?;
        if self.current() != &Token::End {
            return Err(format!("表达式末尾存在多余内容：{:?}", self.current()));
        }
        Ok(value)
    }

    fn parse_bit_or(&mut self) -> Result<Value, String> {
        let mut left = self.parse_bit_xor()?;
        while self.consume(&Token::Pipe) {
            let right = self.parse_bit_xor()?;
            left = Value::number(
                (as_i64(require_number(left, "位运算")?)?
                    | as_i64(require_number(right, "位运算")?)?) as f64,
            );
        }
        Ok(left)
    }

    fn parse_bit_xor(&mut self) -> Result<Value, String> {
        let mut left = self.parse_bit_and()?;
        while self.consume(&Token::Xor) {
            let right = self.parse_bit_and()?;
            left = Value::number(
                (as_i64(require_number(left, "位运算")?)?
                    ^ as_i64(require_number(right, "位运算")?)?) as f64,
            );
        }
        Ok(left)
    }

    fn parse_bit_and(&mut self) -> Result<Value, String> {
        let mut left = self.parse_shift()?;
        while self.consume(&Token::Ampersand) {
            let right = self.parse_shift()?;
            left = Value::number(
                (as_i64(require_number(left, "位运算")?)?
                    & as_i64(require_number(right, "位运算")?)?) as f64,
            );
        }
        Ok(left)
    }

    fn parse_shift(&mut self) -> Result<Value, String> {
        let mut left = self.parse_additive()?;
        loop {
            if self.consume(&Token::ShiftLeft) {
                let shift = as_shift(require_number(self.parse_additive()?, "移位运算")?)?;
                left = Value::number(
                    as_i64(require_number(left, "移位运算")?)?.wrapping_shl(shift) as f64,
                );
            } else if self.consume(&Token::ShiftRight) {
                let shift = as_shift(require_number(self.parse_additive()?, "移位运算")?)?;
                left = Value::number(
                    (as_i64(require_number(left, "移位运算")?)? >> shift) as f64,
                );
            } else {
                break;
            }
        }
        Ok(left)
    }

    fn parse_additive(&mut self) -> Result<Value, String> {
        let mut left = self.parse_multiplicative()?;
        loop {
            if self.consume(&Token::Plus) {
                left = add_values(left, self.parse_multiplicative()?)?;
            } else if self.consume(&Token::Minus) {
                left = subtract_values(left, self.parse_multiplicative()?)?;
            } else {
                break;
            }
            ensure_finite(left.number)?;
        }
        Ok(left)
    }

    fn parse_multiplicative(&mut self) -> Result<Value, String> {
        let mut left = self.parse_unary()?;
        loop {
            if self.consume(&Token::Star) {
                let right = self.parse_unary()?;
                left = Value::number(
                    require_number(left, "乘法")? * require_number(right, "乘法")?,
                );
            } else if self.consume(&Token::Slash) {
                let right = require_number(self.parse_unary()?, "除法")?;
                if right == 0.0 {
                    return Err("不能除以 0".to_owned());
                }
                left = Value::number(require_number(left, "除法")? / right);
            } else if self.consume(&Token::Percent) {
                let right = require_number(self.parse_unary()?, "取模")?;
                if right == 0.0 {
                    return Err("不能对 0 取模".to_owned());
                }
                left = Value::number(require_number(left, "取模")? % right);
            } else {
                break;
            }
            ensure_finite(left.number)?;
        }
        Ok(left)
    }

    fn parse_unary(&mut self) -> Result<Value, String> {
        if self.consume(&Token::Plus) {
            return self.parse_unary();
        }
        if self.consume(&Token::Minus) {
            let value = self.parse_unary()?;
            return match value.kind {
                ValueKind::Number | ValueKind::Duration => Ok(Value {
                    number: -value.number,
                    kind: value.kind,
                }),
                _ => Err("时间点不能直接取负值".to_owned()),
            };
        }
        if self.consume(&Token::Tilde) {
            let value = require_number(self.parse_unary()?, "按位取反")?;
            return Ok(Value::number((!as_i64(value)?) as f64));
        }
        if self.consume(&Token::Sqrt) {
            let value = require_number(self.parse_unary()?, "平方根")?;
            if value < 0.0 {
                return Err("负数不能求实数平方根".to_owned());
            }
            return Ok(Value::number(value.sqrt()));
        }
        self.parse_power()
    }

    fn parse_power(&mut self) -> Result<Value, String> {
        let left = self.parse_primary()?;
        if self.consume(&Token::Power) {
            let right = self.parse_unary()?;
            let value = require_number(left, "乘方")?.powf(require_number(right, "乘方")?);
            ensure_finite(value)?;
            Ok(Value::number(value))
        } else {
            Ok(left)
        }
    }

    fn parse_primary(&mut self) -> Result<Value, String> {
        match self.current().clone() {
            Token::Number(value) => {
                self.advance();
                Ok(Value::number(value))
            }
            Token::Ident(name) => {
                self.advance();
                if self.consume(&Token::LeftParen) {
                    let arguments = self.parse_arguments()?;
                    let numeric_arguments = arguments
                        .into_iter()
                        .map(|argument| require_number(argument, "函数参数"))
                        .collect::<Result<Vec<_>, _>>()?;
                    evaluate_function(&name, &numeric_arguments).map(Value::number)
                } else {
                    self.resolve_variable(&name)
                }
            }
            Token::LeftParen => {
                self.advance();
                let value = self.parse_bit_or()?;
                self.expect(&Token::RightParen, "缺少右括号")?;
                Ok(value)
            }
            Token::End => Err("表达式不完整".to_owned()),
            token => Err(format!("此处不能使用 {token:?}")),
        }
    }

    fn parse_arguments(&mut self) -> Result<Vec<Value>, String> {
        let mut arguments = Vec::new();
        if self.consume(&Token::RightParen) {
            return Ok(arguments);
        }
        loop {
            arguments.push(self.parse_bit_or()?);
            if self.consume(&Token::Comma) {
                continue;
            }
            self.expect(&Token::RightParen, "函数调用缺少右括号")?;
            break;
        }
        Ok(arguments)
    }

    fn resolve_variable(&self, name: &str) -> Result<Value, String> {
        match name {
            "pi" => Ok(Value::number(std::f64::consts::PI)),
            "e" => Ok(Value::number(std::f64::consts::E)),
            "res" => Ok(Value {
                number: self.res,
                kind: self.res_kind,
            }),
            "tmstamp" => Ok(Value {
                number: self.now_timestamp,
                kind: ValueKind::UnixTimestamp,
            }),
            "tmlocal" => Ok(Value {
                number: self.now_timestamp,
                kind: ValueKind::LocalDateTime,
            }),
            "tmutc" => Ok(Value {
                number: self.now_timestamp,
                kind: ValueKind::UtcDateTime,
            }),
            _ => self.variables.get(name).copied().map_or_else(
                || Err(format!("未知变量：{name}")),
                |number| {
                    Ok(Value {
                        number,
                        kind: self.variable_kinds.get(name).copied().unwrap_or_default(),
                    })
                },
            ),
        }
    }

    fn current(&self) -> &Token {
        self.tokens.get(self.position).unwrap_or(&Token::End)
    }

    fn advance(&mut self) {
        if self.position < self.tokens.len() {
            self.position += 1;
        }
    }

    fn consume(&mut self, expected: &Token) -> bool {
        if self.current() == expected {
            self.advance();
            true
        } else {
            false
        }
    }

    fn expect(&mut self, expected: &Token, message: &str) -> Result<(), String> {
        if self.consume(expected) {
            Ok(())
        } else {
            Err(message.to_owned())
        }
    }
}

fn is_time_point(kind: ValueKind) -> bool {
    matches!(
        kind,
        ValueKind::UnixTimestamp | ValueKind::LocalDateTime | ValueKind::UtcDateTime
    )
}

fn add_values(left: Value, right: Value) -> Result<Value, String> {
    let kind = match (left.kind, right.kind) {
        (ValueKind::Number, ValueKind::Number) => ValueKind::Number,
        (ValueKind::Duration, ValueKind::Duration | ValueKind::Number)
        | (ValueKind::Number, ValueKind::Duration) => ValueKind::Duration,
        (left_kind, ValueKind::Duration | ValueKind::Number) if is_time_point(left_kind) => {
            left_kind
        }
        (ValueKind::Duration | ValueKind::Number, right_kind) if is_time_point(right_kind) => {
            right_kind
        }
        (left_kind, right_kind) if is_time_point(left_kind) && is_time_point(right_kind) => {
            return Err("两个时间点不能相加".to_owned());
        }
        _ => return Err("不支持这些值的加法".to_owned()),
    };
    Ok(Value {
        number: left.number + right.number,
        kind,
    })
}

fn subtract_values(left: Value, right: Value) -> Result<Value, String> {
    let kind = match (left.kind, right.kind) {
        (ValueKind::Number, ValueKind::Number) => ValueKind::Number,
        (ValueKind::Duration, ValueKind::Duration | ValueKind::Number) => ValueKind::Duration,
        (left_kind, right_kind) if is_time_point(left_kind) && is_time_point(right_kind) => {
            ValueKind::Duration
        }
        (left_kind, ValueKind::Duration | ValueKind::Number) if is_time_point(left_kind) => {
            left_kind
        }
        _ => return Err("时间点只能减去时间点、秒数或时间差".to_owned()),
    };
    Ok(Value {
        number: left.number - right.number,
        kind,
    })
}

fn require_number(value: Value, operation: &str) -> Result<f64, String> {
    if value.kind == ValueKind::Number {
        Ok(value.number)
    } else {
        Err(format!("{operation}只接受普通数值"))
    }
}

fn evaluate_function(name: &str, arguments: &[f64]) -> Result<f64, String> {
    let value = match name {
        "sqrt" => unary_function(name, arguments, |value| {
            if value < 0.0 {
                Err("负数不能求实数平方根".to_owned())
            } else {
                Ok(value.sqrt())
            }
        })?,
        "cbrt" => unary_function(name, arguments, |value| Ok(value.cbrt()))?,
        "root" => {
            require_arity(name, arguments, 2)?;
            nth_root(arguments[0], arguments[1])?
        }
        "pow" => {
            require_arity(name, arguments, 2)?;
            arguments[0].powf(arguments[1])
        }
        "abs" => unary_function(name, arguments, |value| Ok(value.abs()))?,
        "floor" => unary_function(name, arguments, |value| Ok(value.floor()))?,
        "ceil" => unary_function(name, arguments, |value| Ok(value.ceil()))?,
        "round" => unary_function(name, arguments, |value| Ok(value.round()))?,
        "trunc" => unary_function(name, arguments, |value| Ok(value.trunc()))?,
        "sin" => unary_function(name, arguments, |value| Ok(value.sin()))?,
        "cos" => unary_function(name, arguments, |value| Ok(value.cos()))?,
        "tan" => unary_function(name, arguments, |value| Ok(value.tan()))?,
        "asin" => unary_function(name, arguments, |value| Ok(value.asin()))?,
        "acos" => unary_function(name, arguments, |value| Ok(value.acos()))?,
        "atan" => unary_function(name, arguments, |value| Ok(value.atan()))?,
        "ln" => unary_function(name, arguments, |value| Ok(value.ln()))?,
        "log" | "log10" => unary_function(name, arguments, |value| Ok(value.log10()))?,
        "exp" => unary_function(name, arguments, |value| Ok(value.exp()))?,
        "min" => {
            require_at_least_one(name, arguments)?;
            arguments.iter().copied().fold(f64::INFINITY, f64::min)
        }
        "max" => {
            require_at_least_one(name, arguments)?;
            arguments
                .iter()
                .copied()
                .fold(f64::NEG_INFINITY, f64::max)
        }
        _ => return Err(format!("未知函数：{name}")),
    };
    ensure_finite(value)?;
    Ok(value)
}

fn unary_function(
    name: &str,
    arguments: &[f64],
    function: impl FnOnce(f64) -> Result<f64, String>,
) -> Result<f64, String> {
    require_arity(name, arguments, 1)?;
    function(arguments[0])
}

fn require_arity(name: &str, arguments: &[f64], expected: usize) -> Result<(), String> {
    if arguments.len() == expected {
        Ok(())
    } else {
        Err(format!("函数 {name} 需要 {expected} 个参数"))
    }
}

fn require_at_least_one(name: &str, arguments: &[f64]) -> Result<(), String> {
    if arguments.is_empty() {
        Err(format!("函数 {name} 至少需要 1 个参数"))
    } else {
        Ok(())
    }
}

fn nth_root(value: f64, degree: f64) -> Result<f64, String> {
    if degree == 0.0 {
        return Err("根指数不能为 0".to_owned());
    }
    if value < 0.0 {
        let integer_degree = as_i64(degree)?;
        if integer_degree % 2 == 0 {
            return Err("负数只能求奇数次实数根".to_owned());
        }
        return Ok(-(-value).powf(1.0 / degree));
    }
    Ok(value.powf(1.0 / degree))
}

fn as_i64(value: f64) -> Result<i64, String> {
    const LOWER_BOUND: f64 = -9_223_372_036_854_775_808.0;
    const UPPER_BOUND_EXCLUSIVE: f64 = 9_223_372_036_854_775_808.0;

    if !value.is_finite()
        || value.fract() != 0.0
        || !(LOWER_BOUND..UPPER_BOUND_EXCLUSIVE).contains(&value)
    {
        return Err("位运算只接受 64 位整数".to_owned());
    }
    Ok(value as i64)
}

fn as_shift(value: f64) -> Result<u32, String> {
    let integer = as_i64(value)?;
    if !(0..=63).contains(&integer) {
        return Err("移位量必须在 0 到 63 之间".to_owned());
    }
    Ok(integer as u32)
}

fn convert_to_ascii_codes(source: &str) -> Result<String, String> {
    let text = unquote(source.trim());
    if text.is_empty() {
        return Err("ASCII 转换的字符串不能为空".to_owned());
    }
    if let Some(character) = text.chars().find(|character| !character.is_ascii()) {
        return Err(format!("字符“{character}”不属于 ASCII（范围 0–127）"));
    }

    Ok(text
        .bytes()
        .map(|byte| byte.to_string())
        .collect::<Vec<_>>()
        .join(" "))
}

fn convert_ascii_codes_to_string(source: &str) -> Result<String, String> {
    let mut result = String::new();
    let mut count = 0_usize;

    for raw_code in source.split(|character: char| character == ',' || character.is_whitespace()) {
        if raw_code.is_empty() {
            continue;
        }
        let code = raw_code
            .parse::<u16>()
            .map_err(|_| format!("无效的 ASCII 编码：{raw_code}"))?;
        if code > 127 {
            return Err(format!("ASCII 编码必须在 0–127 之间：{code}"));
        }
        result.push(char::from(code as u8));
        count += 1;
    }

    if count == 0 {
        Err("ASCII 转字符缺少编码；多个编码请用空格或逗号分隔".to_owned())
    } else {
        Ok(result)
    }
}

fn unquote(source: &str) -> &str {
    if source.len() >= 2 {
        let bytes = source.as_bytes();
        if matches!((bytes[0], bytes[source.len() - 1]), (b'\'', b'\'') | (b'"', b'"')) {
            return &source[1..source.len() - 1];
        }
    }
    source
}

fn format_value(value: Value) -> Result<String, String> {
    match value.kind {
        ValueKind::Number | ValueKind::UnixTimestamp => Ok(format_number(value.number)),
        ValueKind::LocalDateTime => format_datetime(value.number, true),
        ValueKind::UtcDateTime => format_datetime(value.number, false),
        ValueKind::Duration => format_duration(value.number),
    }
}

fn format_datetime(value: f64, local: bool) -> Result<String, String> {
    let seconds = as_timestamp_seconds(value)?;
    if local {
        Local
            .timestamp_opt(seconds, 0)
            .single()
            .map(|date_time| date_time.format("%Y-%m-%d %H:%M:%S").to_string())
            .ok_or_else(|| "本地时间超出支持范围".to_owned())
    } else {
        Utc.timestamp_opt(seconds, 0)
            .single()
            .map(|date_time| date_time.format("%Y-%m-%d %H:%M:%S").to_string())
            .ok_or_else(|| "UTC 时间超出支持范围".to_owned())
    }
}

fn as_timestamp_seconds(value: f64) -> Result<i64, String> {
    const LOWER_BOUND: f64 = -9_223_372_036_854_775_808.0;
    const UPPER_BOUND_EXCLUSIVE: f64 = 9_223_372_036_854_775_808.0;
    if !value.is_finite() || !(LOWER_BOUND..UPPER_BOUND_EXCLUSIVE).contains(&value) {
        return Err("时间戳超出支持范围".to_owned());
    }
    Ok(value.trunc() as i64)
}

fn format_duration(value: f64) -> Result<String, String> {
    if !value.is_finite() || value.abs() > u64::MAX as f64 {
        return Err("时间差超出支持范围".to_owned());
    }

    let total_seconds = value.abs().trunc() as u64;
    let days = total_seconds / 86_400;
    let hours = total_seconds % 86_400 / 3_600;
    let minutes = total_seconds % 3_600 / 60;
    let seconds = total_seconds % 60;
    let sign = if value.is_sign_negative() && total_seconds != 0 {
        "-"
    } else {
        ""
    };

    Ok(format!(
        "{sign}0000-00-{days:02} {hours:02}:{minutes:02}:{seconds:02}"
    ))
}

fn format_in_base(value: f64, base: &str) -> Result<String, String> {
    if base == "dec" {
        return Ok(format_number(value));
    }

    const LOWER_BOUND: f64 = -9_223_372_036_854_775_808.0;
    const UPPER_BOUND_EXCLUSIVE: f64 = 9_223_372_036_854_775_808.0;
    if !value.is_finite() || !(LOWER_BOUND..UPPER_BOUND_EXCLUSIVE).contains(&value) {
        return Err("非十进制输出的整数部分必须在 64 位有符号范围内".to_owned());
    }

    let (radix, prefix, max_fraction_digits) = match base {
        "bin" => (2_u32, "0b", 1_074_usize),
        "oct" => (8_u32, "0o", 358_usize),
        "hex" => (16_u32, "0x", 269_usize),
        _ => return Err("不支持的进制输出".to_owned()),
    };
    let sign = if value.is_sign_negative() && value != 0.0 {
        "-"
    } else {
        ""
    };
    let magnitude = value.abs();
    let integer = magnitude.trunc() as u64;
    let integer_digits = format_unsigned(integer, radix);
    let fraction_digits = format_fraction(magnitude.fract(), radix, max_fraction_digits);

    if fraction_digits.is_empty() {
        Ok(format!("{sign}{prefix}{integer_digits}"))
    } else {
        Ok(format!(
            "{sign}{prefix}{integer_digits}.{fraction_digits}"
        ))
    }
}

fn format_unsigned(mut value: u64, radix: u32) -> String {
    if value == 0 {
        return "0".to_owned();
    }

    let mut digits = Vec::new();
    while value > 0 {
        let digit = (value % u64::from(radix)) as u32;
        digits.push(char::from_digit(digit, radix).expect("radix is at most hexadecimal"));
        value /= u64::from(radix);
    }
    digits.into_iter().rev().collect()
}

fn format_fraction(mut fraction: f64, radix: u32, max_digits: usize) -> String {
    let mut digits = String::new();
    for _ in 0..max_digits {
        if fraction == 0.0 {
            break;
        }
        fraction *= f64::from(radix);
        let digit = fraction.floor() as u32;
        digits.push(char::from_digit(digit, radix).expect("radix is at most hexadecimal"));
        fraction -= f64::from(digit);
    }
    digits
}

fn format_number(value: f64) -> String {
    if value == 0.0 {
        return "0".to_owned();
    }
    if value.fract() == 0.0 && value.abs() < 1e16 {
        return format!("{value:.0}");
    }

    let absolute = value.abs();
    if !(1e-9..1e15).contains(&absolute) {
        let formatted = format!("{value:.12e}");
        let (mantissa, exponent) = formatted
            .split_once('e')
            .expect("scientific notation always contains an exponent");
        let mantissa = mantissa.trim_end_matches('0').trim_end_matches('.');
        return format!("{mantissa}e{}", exponent.trim_start_matches('+'));
    }

    let formatted = format!("{value:.12}");
    formatted
        .trim_end_matches('0')
        .trim_end_matches('.')
        .to_owned()
}

fn ensure_finite(value: f64) -> Result<(), String> {
    if value.is_finite() {
        Ok(())
    } else {
        Err("结果不是有限数值，请检查函数定义域或数值范围".to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::{Evaluator, EvaluatorOutput};
    use crate::model::ValueKind;
    use std::collections::HashMap;

    fn evaluate_output(expression: &str) -> Result<EvaluatorOutput, String> {
        let variables = HashMap::new();
        let variable_kinds = HashMap::new();
        Evaluator::new(&variables, &variable_kinds, 12.0, ValueKind::Number)
            .evaluate(expression)
    }

    fn evaluate(expression: &str) -> Result<(f64, String), String> {
        evaluate_output(expression).map(|output| {
            (
                output.value.expect("numeric expression should have a value"),
                output.display,
            )
        })
    }

    #[test]
    fn honors_arithmetic_precedence() {
        assert_eq!(evaluate("(2 + 3) * 4").unwrap().0, 20.0);
        assert_eq!(evaluate("-2 ** 2").unwrap().0, -4.0);
        assert_eq!(evaluate("2 ** 3 ** 2").unwrap().0, 512.0);
    }

    #[test]
    fn evaluates_roots_and_constants() {
        assert_eq!(evaluate("sqrt(81) + root(32, 5)").unwrap().0, 11.0);
        assert!((evaluate("pi * 2").unwrap().0 - std::f64::consts::TAU).abs() < 1e-12);
    }

    #[test]
    fn normalizes_chinese_and_full_width_expression_input() {
        assert_eq!(evaluate("（２＋３）×４").unwrap().0, 20.0);
        assert_eq!(evaluate("ｍａｘ【１，２】").unwrap().0, 2.0);
        assert_eq!(evaluate("２５５．ｈｅｘ").unwrap().1, "0xff");
    }

    #[test]
    fn evaluates_bitwise_and_base_operations() {
        assert_eq!(evaluate("(0xff & 0b1010) << 2").unwrap().0, 40.0);
        assert_eq!(evaluate("5 ^ 3").unwrap().0, 6.0);
        assert_eq!(evaluate("5 xor 3").unwrap().0, 6.0);
        assert_eq!(evaluate("2 ^ 3 ** 2").unwrap().0, 11.0);
        assert_eq!(evaluate("0b1010.oct").unwrap().1, "0o12");
        assert_eq!(evaluate("255.hex").unwrap().1, "0xff");
        assert_eq!(evaluate("10.25.bin").unwrap().1, "0b1010.01");
        assert_eq!(
            evaluate("12345.6789.hex").unwrap().1,
            "0x3039.adcc63f142"
        );
        assert!(evaluate("255 -> hex").is_err());
    }

    #[test]
    fn variables_are_case_insensitive_and_builtins_are_read_only() {
        let mut variables = HashMap::new();
        let variable_kinds = HashMap::new();
        variables.insert("tax".to_owned(), 0.09);
        let output = Evaluator::new(&variables, &variable_kinds, 12.0, ValueKind::Number)
            .evaluate("199 * (1 + TAX)")
            .unwrap();
        assert!((output.value.unwrap() - 216.91).abs() < 1e-10);
        assert!(evaluate("pi = 3").unwrap_err().contains("只读"));
        assert!(evaluate("tmstamp = 3").unwrap_err().contains("只读"));
    }

    #[test]
    fn exposes_time_variables_and_formats_time_differences() {
        let timestamp = evaluate_output("tmstamp").unwrap();
        assert_eq!(timestamp.value_kind, ValueKind::UnixTimestamp);
        assert!(timestamp.value.unwrap() > 1_000_000_000.0);
        assert!(timestamp.display.chars().all(|character| character.is_ascii_digit()));

        for variable in ["tmlocal", "tmutc"] {
            let display = evaluate_output(variable).unwrap().display;
            assert_eq!(display.len(), 19);
            assert_eq!(&display[4..5], "-");
            assert_eq!(&display[10..11], " ");
            assert_eq!(&display[13..14], ":");
        }

        assert_eq!(
            evaluate_output("tmlocal - tmutc").unwrap().display,
            "0000-00-00 00:00:00"
        );

        let variables = HashMap::from([
            ("start".to_owned(), 1_700_000_000.0),
            ("stop".to_owned(), 1_700_090_061.0),
        ]);
        let variable_kinds = HashMap::from([
            ("start".to_owned(), ValueKind::UnixTimestamp),
            ("stop".to_owned(), ValueKind::UnixTimestamp),
        ]);
        let output = Evaluator::new(&variables, &variable_kinds, 0.0, ValueKind::Number)
            .evaluate("stop - start")
            .unwrap();
        assert_eq!(output.value_kind, ValueKind::Duration);
        assert_eq!(output.display, "0000-00-01 01:01:01");
    }

    #[test]
    fn converts_ascii_text_and_code_sequences() {
        let ascii = evaluate_output("Hello.ascii").unwrap();
        assert_eq!(ascii.value, None);
        assert_eq!(ascii.display, "72 101 108 108 111");
        assert_eq!(evaluate_output("72 101 108 108 111.tostr").unwrap().display, "Hello");
        assert_eq!(evaluate_output("65, 66.tostr").unwrap().display, "AB");
        assert!(evaluate_output("你好.ascii").is_err());
        assert!(evaluate_output("128.tostr").is_err());
        assert!(evaluate_output("message = Hello.ascii").is_err());
    }

    #[test]
    fn rejects_invalid_numeric_operations() {
        assert!(evaluate("1 / 0").is_err());
        assert!(evaluate("1.5 & 1").is_err());
        assert!(evaluate("1.5 ^ 1").is_err());
        assert!(evaluate("sqrt(-1)").is_err());
    }
}
