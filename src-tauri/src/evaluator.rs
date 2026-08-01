use std::collections::HashMap;

use crate::model::is_builtin;

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
    pub value: f64,
    pub display: String,
    pub assigned_variable: Option<String>,
}

pub struct Evaluator<'a> {
    variables: &'a HashMap<String, f64>,
    res: f64,
}

impl<'a> Evaluator<'a> {
    pub fn new(variables: &'a HashMap<String, f64>, res: f64) -> Self {
        Self { variables, res }
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
        let tokens = tokenize(&numeric_expression)?;
        let mut parser = Parser::new(tokens, self.variables, self.res);
        let value = parser.parse()?;
        ensure_finite(value)?;

        let display = match conversion.as_deref() {
            Some(base) => format_in_base(value, base)?,
            None => format_number(value),
        };

        Ok(EvaluatorOutput {
            value,
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

fn split_conversion(expression: &str) -> Result<(String, Option<String>), String> {
    let bytes = expression.as_bytes();
    let mut depth = 0_i32;
    let mut arrow_index = None;
    let mut index = 0_usize;

    while index < bytes.len() {
        match bytes[index] {
            b'(' => depth += 1,
            b')' => depth -= 1,
            b'-' if depth == 0 && bytes.get(index + 1) == Some(&b'>') => {
                if arrow_index.replace(index).is_some() {
                    return Err("一次只能指定一个进制输出".to_owned());
                }
                index += 1;
            }
            _ => {}
        }
        index += 1;
    }

    let Some(index) = arrow_index else {
        return Ok((expression.to_owned(), None));
    };
    let target = expression[index + 2..].trim().to_ascii_lowercase();
    if !matches!(target.as_str(), "bin" | "oct" | "dec" | "hex") {
        return Err("进制输出只支持 bin、oct、dec 或 hex".to_owned());
    }
    let numeric_expression = expression[..index].trim();
    if numeric_expression.is_empty() {
        return Err("进制转换缺少表达式".to_owned());
    }
    Ok((numeric_expression.to_owned(), Some(target)))
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
    res: f64,
}

impl<'a> Parser<'a> {
    fn new(tokens: Vec<Token>, variables: &'a HashMap<String, f64>, res: f64) -> Self {
        Self {
            tokens,
            position: 0,
            variables,
            res,
        }
    }

    fn parse(&mut self) -> Result<f64, String> {
        let value = self.parse_bit_or()?;
        if self.current() != &Token::End {
            return Err(format!("表达式末尾存在多余内容：{:?}", self.current()));
        }
        Ok(value)
    }

    fn parse_bit_or(&mut self) -> Result<f64, String> {
        let mut left = self.parse_bit_xor()?;
        while self.consume(&Token::Pipe) {
            let right = self.parse_bit_xor()?;
            left = (as_i64(left)? | as_i64(right)?) as f64;
        }
        Ok(left)
    }

    fn parse_bit_xor(&mut self) -> Result<f64, String> {
        let mut left = self.parse_bit_and()?;
        while self.consume(&Token::Xor) {
            let right = self.parse_bit_and()?;
            left = (as_i64(left)? ^ as_i64(right)?) as f64;
        }
        Ok(left)
    }

    fn parse_bit_and(&mut self) -> Result<f64, String> {
        let mut left = self.parse_shift()?;
        while self.consume(&Token::Ampersand) {
            let right = self.parse_shift()?;
            left = (as_i64(left)? & as_i64(right)?) as f64;
        }
        Ok(left)
    }

    fn parse_shift(&mut self) -> Result<f64, String> {
        let mut left = self.parse_additive()?;
        loop {
            if self.consume(&Token::ShiftLeft) {
                let shift = as_shift(self.parse_additive()?)?;
                left = as_i64(left)?.wrapping_shl(shift) as f64;
            } else if self.consume(&Token::ShiftRight) {
                let shift = as_shift(self.parse_additive()?)?;
                left = (as_i64(left)? >> shift) as f64;
            } else {
                break;
            }
        }
        Ok(left)
    }

    fn parse_additive(&mut self) -> Result<f64, String> {
        let mut left = self.parse_multiplicative()?;
        loop {
            if self.consume(&Token::Plus) {
                left += self.parse_multiplicative()?;
            } else if self.consume(&Token::Minus) {
                left -= self.parse_multiplicative()?;
            } else {
                break;
            }
            ensure_finite(left)?;
        }
        Ok(left)
    }

    fn parse_multiplicative(&mut self) -> Result<f64, String> {
        let mut left = self.parse_unary()?;
        loop {
            if self.consume(&Token::Star) {
                left *= self.parse_unary()?;
            } else if self.consume(&Token::Slash) {
                let right = self.parse_unary()?;
                if right == 0.0 {
                    return Err("不能除以 0".to_owned());
                }
                left /= right;
            } else if self.consume(&Token::Percent) {
                let right = self.parse_unary()?;
                if right == 0.0 {
                    return Err("不能对 0 取模".to_owned());
                }
                left %= right;
            } else {
                break;
            }
            ensure_finite(left)?;
        }
        Ok(left)
    }

    fn parse_unary(&mut self) -> Result<f64, String> {
        if self.consume(&Token::Plus) {
            return self.parse_unary();
        }
        if self.consume(&Token::Minus) {
            return Ok(-self.parse_unary()?);
        }
        if self.consume(&Token::Tilde) {
            return Ok((!as_i64(self.parse_unary()?)?) as f64);
        }
        if self.consume(&Token::Sqrt) {
            let value = self.parse_unary()?;
            if value < 0.0 {
                return Err("负数不能求实数平方根".to_owned());
            }
            return Ok(value.sqrt());
        }
        self.parse_power()
    }

    fn parse_power(&mut self) -> Result<f64, String> {
        let left = self.parse_primary()?;
        if self.consume(&Token::Power) {
            let right = self.parse_unary()?;
            let value = left.powf(right);
            ensure_finite(value)?;
            Ok(value)
        } else {
            Ok(left)
        }
    }

    fn parse_primary(&mut self) -> Result<f64, String> {
        match self.current().clone() {
            Token::Number(value) => {
                self.advance();
                Ok(value)
            }
            Token::Ident(name) => {
                self.advance();
                if self.consume(&Token::LeftParen) {
                    let arguments = self.parse_arguments()?;
                    evaluate_function(&name, &arguments)
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

    fn parse_arguments(&mut self) -> Result<Vec<f64>, String> {
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

    fn resolve_variable(&self, name: &str) -> Result<f64, String> {
        match name {
            "pi" => Ok(std::f64::consts::PI),
            "e" => Ok(std::f64::consts::E),
            "res" => Ok(self.res),
            _ => self
                .variables
                .get(name)
                .copied()
                .ok_or_else(|| format!("未知变量：{name}")),
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
        return Err("位运算和非十进制输出只接受 64 位整数".to_owned());
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

fn format_in_base(value: f64, base: &str) -> Result<String, String> {
    if base == "dec" {
        return Ok(format_number(value));
    }
    let integer = as_i64(value)?;
    let sign = if integer < 0 { "-" } else { "" };
    let magnitude = integer.unsigned_abs();
    match base {
        "bin" => Ok(format!("{sign}0b{magnitude:b}")),
        "oct" => Ok(format!("{sign}0o{magnitude:o}")),
        "hex" => Ok(format!("{sign}0x{magnitude:x}")),
        _ => Err("不支持的进制输出".to_owned()),
    }
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
    use super::Evaluator;
    use std::collections::HashMap;

    fn evaluate(expression: &str) -> Result<(f64, String), String> {
        let variables = HashMap::new();
        Evaluator::new(&variables, 12.0)
            .evaluate(expression)
            .map(|output| (output.value, output.display))
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
        assert_eq!(evaluate("２５５ －＞ ｈｅｘ").unwrap().1, "0xff");
    }

    #[test]
    fn evaluates_bitwise_and_base_operations() {
        assert_eq!(evaluate("(0xff & 0b1010) << 2").unwrap().0, 40.0);
        assert_eq!(evaluate("5 ^ 3").unwrap().0, 6.0);
        assert_eq!(evaluate("5 xor 3").unwrap().0, 6.0);
        assert_eq!(evaluate("2 ^ 3 ** 2").unwrap().0, 11.0);
        assert_eq!(evaluate("255 -> hex").unwrap().1, "0xff");
    }

    #[test]
    fn variables_are_case_insensitive_and_builtins_are_read_only() {
        let mut variables = HashMap::new();
        variables.insert("tax".to_owned(), 0.09);
        let output = Evaluator::new(&variables, 12.0)
            .evaluate("199 * (1 + TAX)")
            .unwrap();
        assert!((output.value - 216.91).abs() < 1e-10);
        assert!(evaluate("pi = 3").unwrap_err().contains("只读"));
    }

    #[test]
    fn rejects_invalid_numeric_operations() {
        assert!(evaluate("1 / 0").is_err());
        assert!(evaluate("1.5 & 1").is_err());
        assert!(evaluate("1.5 ^ 1").is_err());
        assert!(evaluate("sqrt(-1)").is_err());
    }
}
