/**
 * Tool Declarations & JSON Schema definitions for Assistant Function Calling.
 * Formats role-scoped tools into OpenAI and Gemini function calling specifications.
 */

const { z } = require('zod');

// Descriptions and parameter schemas for every assistant tool
const TOOL_DEFINITIONS = {
  // --- TPO Tools ---
  placementSummary: {
    description: 'Get overall placement statistics (total students, verified count, placed count, percentage, average/highest/median package) for your college, optionally filtered by batch year or department/branch.',
    parameters: {
      type: 'object',
      properties: {
        batch: { type: 'number', description: 'Graduation batch year (e.g. 2025)' },
        department: { type: 'string', description: 'Department or branch code (e.g. CSE, IT, MECH)' },
      },
    },
    roles: ['tpo', 'superadmin', 'admin'],
  },

  departmentBreakdown: {
    description: 'Get placement statistics broken down across all departments/branches for your college, including total students, placed count, placement percentage, and average CTC.',
    parameters: {
      type: 'object',
      properties: {
        batch: { type: 'number', description: 'Graduation batch year (e.g. 2025)' },
      },
    },
    roles: ['tpo', 'superadmin', 'admin'],
  },

  unplacedStudents: {
    description: 'List eligible unplaced students for your college to follow up or recommend for upcoming drives, optionally filtered by branch or batch year.',
    parameters: {
      type: 'object',
      properties: {
        department: { type: 'string', description: 'Department or branch code (e.g. CSE, IT)' },
        batch: { type: 'number', description: 'Graduation batch year (e.g. 2025)' },
        limit: { type: 'number', description: 'Max number of students to return (1-20, default 20)' },
      },
    },
    roles: ['tpo', 'superadmin', 'admin'],
  },

  companyStats: {
    description: 'Get hiring statistics for companies visiting your college (offers made, average package, visiting drives). Can filter by a specific company name.',
    parameters: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company name to search (e.g. Google, Microsoft, Infosys)' },
      },
    },
    roles: ['tpo', 'superadmin', 'admin'],
  },

  driveFunnel: {
    description: 'Get stage-by-stage candidate progression funnel (registered -> aptitude -> technical interview -> HR -> offers) for a placement drive at your college.',
    parameters: {
      type: 'object',
      properties: {
        driveName: { type: 'string', description: 'Drive title or keywords' },
        company: { type: 'string', description: 'Company name hosting the drive' },
      },
    },
    roles: ['tpo', 'superadmin', 'admin'],
  },

  upcomingDrives: {
    description: 'List upcoming campus placement drives scheduled at your college within a specified number of days.',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of upcoming days to look ahead (default 30, max 60)' },
      },
    },
    roles: ['tpo', 'superadmin', 'admin'],
  },

  offerStatus: {
    description: 'Get breakdown of placement offers extended to your students, grouped by offer status (pending, accepted, declined, revoked).',
    parameters: {
      type: 'object',
      properties: {
        batch: { type: 'number', description: 'Graduation batch year (e.g. 2025)' },
      },
    },
    roles: ['tpo', 'superadmin', 'admin'],
  },

  studentsWithSkill: {
    description: 'Find students in your college who possess a specific technical skill or verified proficiency.',
    parameters: {
      type: 'object',
      properties: {
        skill: { type: 'string', description: 'Technical skill to search for (e.g. python, react, docker, aws)' },
      },
      required: ['skill'],
    },
    roles: ['tpo', 'superadmin', 'admin'],
  },

  studentsWithoutResume: {
    description: 'List enrolled students in your college who have not yet uploaded a verified resume.',
    parameters: {
      type: 'object',
      properties: {
        department: { type: 'string', description: 'Optional department/branch code (e.g. CSE, IT)' },
      },
    },
    roles: ['tpo', 'superadmin', 'admin'],
  },

  topPackages: {
    description: 'List highest compensation packages (CTC in LPA) secured by students of your college.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of top offers to return (default 5, max 10)' },
      },
    },
    roles: ['tpo', 'superadmin', 'admin'],
  },

  // --- Student Tools ---
  myApplications: {
    description: 'View your submitted job applications, including company, drive role, current selection stage, and status (applied, shortlisted, rejected, offered).',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by application status (e.g. applied, shortlisted, offered)' },
      },
    },
    roles: ['student'],
  },

  myUpcomingInterviews: {
    description: 'View your scheduled upcoming interview slots, including date, time, interview mode, company, and video meeting room link.',
    parameters: {
      type: 'object',
      properties: {},
    },
    roles: ['student'],
  },

  upcomingEligibleDrives: {
    description: 'List upcoming campus placement drives you are academically and technically eligible to apply for based on your branch, CGPA, and backlog record.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max number of drives to return (default 5)' },
      },
    },
    roles: ['student'],
  },

  myEligibility: {
    description: 'Check whether you meet academic and policy eligibility criteria for a specific company or drive.',
    parameters: {
      type: 'object',
      properties: {
        company: { type: 'string', description: 'Company name to check eligibility for' },
        drive: { type: 'string', description: 'Drive title' },
      },
    },
    roles: ['student'],
  },

  myResumeStatus: {
    description: 'Check the status of your uploaded resume, verified skills list, and ATS optimization profile.',
    parameters: {
      type: 'object',
      properties: {},
    },
    roles: ['student'],
  },

  // --- Recruiter Tools ---
  myDrivesSummary: {
    description: 'Get an overview of your active and past hiring drives, applicant counts, and stages.',
    parameters: {
      type: 'object',
      properties: {},
    },
    roles: ['recruiter'],
  },

  myDriveFunnel: {
    description: 'View the hiring funnel for your company drive (registered -> online test -> technical interview -> HR -> offers).',
    parameters: {
      type: 'object',
      properties: {
        driveName: { type: 'string', description: 'Title or keywords of your drive' },
      },
    },
    roles: ['recruiter'],
  },

  myTopApplicants: {
    description: 'List top-ranked student applicants for your drives based on academic merit, ATS match score, and technical skill verification.',
    parameters: {
      type: 'object',
      properties: {
        drive: { type: 'string', description: 'Drive title or keywords' },
        limit: { type: 'number', description: 'Max candidates to return (default 5, max 10)' },
      },
    },
    roles: ['recruiter'],
  },

  myDriveRequests: {
    description: 'View the status of campus drive requests sent to partner colleges (pending, accepted, rejected).',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by request status (e.g. pending, accepted)' },
      },
    },
    roles: ['recruiter'],
  },

  // --- RAG Knowledge Base Tool ---
  searchKnowledgeBase: {
    description: 'Search the official platform knowledge base, FAQs, and placement guidelines for policy, rules, or procedural answers.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The topic or question to search documentation for' },
      },
      required: ['query'],
    },
    roles: ['student', 'tpo', 'recruiter', 'superadmin', 'admin', 'common'],
  },
};

/**
 * Returns OpenAI-compatible function calling tool specs for a specific role
 */
function getToolsForRole(role) {
  const normRole = String(role || '').toLowerCase();
  const tools = [];

  for (const [name, def] of Object.entries(TOOL_DEFINITIONS)) {
    if (def.roles.includes(normRole) || def.roles.includes('common')) {
      tools.push({
        type: 'function',
        function: {
          name,
          description: def.description,
          parameters: def.parameters,
        },
      });
    }
  }

  return tools;
}

/**
 * Returns Gemini REST-compatible function declarations for a specific role
 */
function getGeminiToolsForRole(role) {
  const normRole = String(role || '').toLowerCase();
  const declarations = [];

  for (const [name, def] of Object.entries(TOOL_DEFINITIONS)) {
    if (def.roles.includes(normRole) || def.roles.includes('common')) {
      declarations.push({
        name,
        description: def.description,
        parameters: def.parameters,
      });
    }
  }

  return [{ functionDeclarations: declarations }];
}

/**
 * Checks whether a tool name is allowed for a given role
 */
function isToolAllowedForRole(toolName, role) {
  const def = TOOL_DEFINITIONS[toolName];
  if (!def) return false;
  const normRole = String(role || '').toLowerCase();
  return def.roles.includes(normRole) || def.roles.includes('common');
}

module.exports = {
  TOOL_DEFINITIONS,
  getToolsForRole,
  getGeminiToolsForRole,
  isToolAllowedForRole,
};
