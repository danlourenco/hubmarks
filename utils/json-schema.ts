import Ajv from 'ajv';
import addFormats from 'ajv-formats';

/**
 * JSON Schema for HubMark bookmark data structure
 */
export const HUBMARK_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "HubMarkBookmarks",
  type: "object",
  required: ["schemaVersion", "bookmarks"],
  additionalProperties: false,
  properties: {
    schemaVersion: { 
      type: "integer", 
      minimum: 1, 
      maximum: 1 
    },
    generatedAt: { 
      type: "string", 
      format: "date-time" 
    },
    bookmarks: {
      type: "array",
      items: { $ref: "#/definitions/bookmark" },
      uniqueItems: true
    },
    meta: {
      type: "object",
      properties: {
        generator: { type: "string" },
        generatorVersion: { type: "string" },
        lastSync: { type: "integer", minimum: 0 }
      },
      additionalProperties: true
    }
  },
  definitions: {
    bookmark: {
      type: "object",
      required: ["id", "title", "url", "dateAdded", "dateModified"],
      additionalProperties: false,
      properties: {
        id: { 
          type: "string", 
          pattern: "^hm_[a-z0-9]{32,}$" 
        },
        title: { 
          type: "string", 
          minLength: 1 
        },
        url: { 
          type: "string", 
          format: "uri" 
        },
        folder: { 
          type: "string"
        },
        tags: {
          type: "array",
          items: { type: "string", minLength: 1 }
        },
        notes: { 
          type: "string"
        },
        dateAdded: { 
          type: "integer", 
          minimum: 0 
        },
        dateModified: { 
          type: "integer", 
          minimum: 0 
        },
        archived: { 
          type: "boolean"
        },
        favorite: { 
          type: "boolean"
        }
      }
    }
  }
} as const;

/**
 * Bookmark data structure matching the JSON schema
 */
export interface HubMarkBookmark {
  id: string;
  title: string;
  url: string;
  folder: string;
  tags: string[];
  notes: string;
  dateAdded: number;
  dateModified: number;
  archived: boolean;
  favorite: boolean;
}

/**
 * Complete data structure for the JSON file
 */
export interface HubMarkData {
  schemaVersion: 1;
  generatedAt?: string;
  bookmarks: HubMarkBookmark[];
  meta?: {
    generator?: string;
    generatorVersion?: string;
    lastSync?: number;
    [key: string]: any;
  };
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * JSON Schema validator instance
 */
class SchemaValidator {
  private ajv: Ajv;

  constructor() {
    this.ajv = new Ajv({ 
      allErrors: true, 
      strict: true,
      useDefaults: false, // Don't apply default values during validation
      removeAdditional: false // Don't remove additional properties during validation
    });
    addFormats(this.ajv);
    this.ajv.addSchema(HUBMARK_SCHEMA, 'HubMarkBookmarks');
  }

  /**
   * Validate HubMark data against JSON schema
   * 
   * @param data - Data to validate
   * @returns Validation result
   */
  validate(data: unknown): ValidationResult {
    const valid = this.ajv.validate('HubMarkBookmarks', data);
    
    if (valid) {
      return { valid: true, errors: [] };
    }

    const errors = this.ajv.errors?.map(error => {
      const path = error.instancePath || 'root';
      return `${path}: ${error.message}`;
    }) || ['Unknown validation error'];

    return { valid: false, errors };
  }

  /**
   * Validate and throw on error
   * 
   * @param data - Data to validate
   * @throws Error if validation fails
   */
  validateOrThrow(data: unknown): asserts data is HubMarkData {
    const result = this.validate(data);
    if (!result.valid) {
      throw new Error(`Schema validation failed:\n${result.errors.join('\n')}`);
    }
  }
}

/**
 * Singleton schema validator instance
 */
export const schemaValidator = new SchemaValidator();

/**
 * Create empty HubMark data structure
 */
export function createEmptyData(): HubMarkData {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    bookmarks: [],
    meta: {
      generator: 'HubMark',
      generatorVersion: '0.1.0',
      lastSync: 0
    }
  };
}