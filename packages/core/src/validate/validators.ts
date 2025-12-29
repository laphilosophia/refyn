/**
 * Strong DSL Validators - Built-in validation rules
 */

export type ValidationType =
  | 'required'
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'email'
  | 'url'
  | 'uuid'
  | 'minLength'
  | 'maxLength'
  | 'min'
  | 'max'
  | 'pattern'
  | 'enum'
  | 'custom';

export interface ValidationRule {
  type: ValidationType;
  value?: unknown;
  message?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    field: string;
    rule: ValidationType;
    message: string;
    value: unknown;
  }>;
}

// Email regex (simple but effective)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// UUID regex (v4)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// URL regex (simple)
const URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

/**
 * Validate a single value against a rule
 */
export function validateValue(
  value: unknown,
  rule: ValidationRule,
  field: string = 'value'
): ValidationResult {
  const errors: ValidationResult['errors'] = [];

  const addError = (message: string) => {
    errors.push({
      field,
      rule: rule.type,
      message: rule.message ?? message,
      value,
    });
  };

  switch (rule.type) {
    case 'required':
      if (value === null || value === undefined || value === '') {
        addError(`${field} is required`);
      }
      break;

    case 'string':
      if (value !== null && value !== undefined && typeof value !== 'string') {
        addError(`${field} must be a string`);
      }
      break;

    case 'number':
      if (value !== null && value !== undefined && typeof value !== 'number') {
        addError(`${field} must be a number`);
      }
      break;

    case 'boolean':
      if (value !== null && value !== undefined && typeof value !== 'boolean') {
        addError(`${field} must be a boolean`);
      }
      break;

    case 'date':
      if (value !== null && value !== undefined) {
        const date = value instanceof Date ? value : new Date(value as string);
        if (isNaN(date.getTime())) {
          addError(`${field} must be a valid date`);
        }
      }
      break;

    case 'email':
      if (typeof value === 'string' && !EMAIL_REGEX.test(value)) {
        addError(`${field} must be a valid email`);
      }
      break;

    case 'url':
      if (typeof value === 'string' && !URL_REGEX.test(value)) {
        addError(`${field} must be a valid URL`);
      }
      break;

    case 'uuid':
      if (typeof value === 'string' && !UUID_REGEX.test(value)) {
        addError(`${field} must be a valid UUID`);
      }
      break;

    case 'minLength':
      if (typeof value === 'string' && value.length < (rule.value as number)) {
        addError(`${field} must be at least ${rule.value} characters`);
      }
      if (Array.isArray(value) && value.length < (rule.value as number)) {
        addError(`${field} must have at least ${rule.value} items`);
      }
      break;

    case 'maxLength':
      if (typeof value === 'string' && value.length > (rule.value as number)) {
        addError(`${field} must be at most ${rule.value} characters`);
      }
      if (Array.isArray(value) && value.length > (rule.value as number)) {
        addError(`${field} must have at most ${rule.value} items`);
      }
      break;

    case 'min':
      if (typeof value === 'number' && value < (rule.value as number)) {
        addError(`${field} must be at least ${rule.value}`);
      }
      break;

    case 'max':
      if (typeof value === 'number' && value > (rule.value as number)) {
        addError(`${field} must be at most ${rule.value}`);
      }
      break;

    case 'pattern':
      if (typeof value === 'string') {
        const regex = rule.value instanceof RegExp
          ? rule.value
          : new RegExp(rule.value as string);
        if (!regex.test(value)) {
          addError(`${field} does not match required pattern`);
        }
      }
      break;

    case 'enum':
      if (!Array.isArray(rule.value) || !rule.value.includes(value)) {
        addError(`${field} must be one of: ${(rule.value as unknown[]).join(', ')}`);
      }
      break;

    case 'custom':
      // Custom validation is handled by the user's validator function
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate an object against multiple rules
 */
export function validateObject(
  obj: Record<string, unknown>,
  rules: Record<string, ValidationRule | ValidationRule[]>
): ValidationResult {
  const allErrors: ValidationResult['errors'] = [];

  for (const [field, fieldRules] of Object.entries(rules)) {
    const value = obj[field];
    const rulesArray = Array.isArray(fieldRules) ? fieldRules : [fieldRules];

    for (const rule of rulesArray) {
      const result = validateValue(value, rule, field);
      allErrors.push(...result.errors);
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}

/**
 * Create a validator function from rules (for use with Pipeline.setValidator)
 */
export function createValidator(
  rules: Record<string, ValidationRule | ValidationRule[]>
): (row: unknown, index: number) => { valid: boolean; errors?: string[] } {
  return (row: unknown) => {
    const result = validateObject(row as Record<string, unknown>, rules);
    return {
      valid: result.valid,
      errors: result.valid ? undefined : result.errors.map(e => e.message),
    };
  };
}

/**
 * Fluent API for building validation rules
 */
export class RuleBuilder {
  private rules: ValidationRule[] = [];

  required(message?: string): this {
    this.rules.push({ type: 'required', message });
    return this;
  }

  string(message?: string): this {
    this.rules.push({ type: 'string', message });
    return this;
  }

  number(message?: string): this {
    this.rules.push({ type: 'number', message });
    return this;
  }

  boolean(message?: string): this {
    this.rules.push({ type: 'boolean', message });
    return this;
  }

  email(message?: string): this {
    this.rules.push({ type: 'email', message });
    return this;
  }

  url(message?: string): this {
    this.rules.push({ type: 'url', message });
    return this;
  }

  uuid(message?: string): this {
    this.rules.push({ type: 'uuid', message });
    return this;
  }

  minLength(length: number, message?: string): this {
    this.rules.push({ type: 'minLength', value: length, message });
    return this;
  }

  maxLength(length: number, message?: string): this {
    this.rules.push({ type: 'maxLength', value: length, message });
    return this;
  }

  min(value: number, message?: string): this {
    this.rules.push({ type: 'min', value, message });
    return this;
  }

  max(value: number, message?: string): this {
    this.rules.push({ type: 'max', value, message });
    return this;
  }

  pattern(regex: RegExp | string, message?: string): this {
    this.rules.push({ type: 'pattern', value: regex, message });
    return this;
  }

  enum(values: unknown[], message?: string): this {
    this.rules.push({ type: 'enum', value: values, message });
    return this;
  }

  build(): ValidationRule[] {
    return this.rules;
  }
}

/**
 * Create a rule builder
 */
export function rule(): RuleBuilder {
  return new RuleBuilder();
}
