/**
 * Ready-to-explore "University" demo ontology behind the UI's "Load sample"
 * action. Deterministic by construction (fixed ids, timestamps and layout) so
 * it can be asserted and exported reproducibly.
 */

import {
  autoLayout,
  createAttribute,
  createClass,
  createOntology,
  createRelation
} from "./model";
import { PALETTE } from "./naming";
import type {
  AttributeCardinality,
  Datatype,
  Ontology,
  OntologyAttribute,
  OntologyClass,
  OntologyRelation
} from "./types";

const SAMPLE_ID = "sample-university";
const SAMPLE_CREATED_AT = "2024-09-01T00:00:00.000Z";
const SAMPLE_BASE_IRI = "https://example.org/ontology/university";

interface AttributeOptions {
  required?: boolean;
  cardinality?: AttributeCardinality;
  description?: string;
  enumValues?: string[];
}

function attribute(
  id: string,
  name: string,
  label: string,
  datatype: Datatype,
  options: AttributeOptions = {}
): OntologyAttribute {
  return createAttribute({
    id,
    name,
    label,
    datatype,
    required: options.required ?? false,
    cardinality: options.cardinality ?? "one",
    description: options.description ?? "",
    enumValues: options.enumValues ?? []
  });
}

function ontologyClass(
  id: string,
  name: string,
  label: string,
  description: string,
  parentId: string | null,
  colorIndex: number,
  attributes: OntologyAttribute[]
): OntologyClass {
  return createClass({
    id,
    name,
    label,
    description,
    parentId,
    color: PALETTE[colorIndex % PALETTE.length],
    attributes
  });
}

function relation(
  id: string,
  name: string,
  label: string,
  description: string,
  sourceClassId: string,
  targetClassId: string,
  cardinality: OntologyRelation["cardinality"]
): OntologyRelation {
  return createRelation({
    id,
    name,
    label,
    description,
    sourceClassId,
    targetClassId,
    cardinality
  });
}

/** A polished University ontology that validates with zero issues. */
export function createSampleOntology(): Ontology {
  const university = ontologyClass(
    "class-university",
    "University",
    "University",
    "A degree-granting higher-education institution.",
    null,
    0,
    [
      attribute("attr-university-name", "officialName", "Official name", "string", {
        required: true,
        description: "Legal name shown on diplomas."
      }),
      attribute("attr-university-founded", "foundedYear", "Founded year", "integer"),
      attribute("attr-university-website", "website", "Website", "uri"),
      attribute("attr-university-public", "isPublic", "Public institution", "boolean")
    ]
  );

  const department = ontologyClass(
    "class-department",
    "Department",
    "Department",
    "An academic unit that owns programmes and courses.",
    "class-university",
    1,
    [
      attribute("attr-department-code", "code", "Code", "string", {
        required: true,
        description: "Short code such as CS or MATH."
      }),
      attribute("attr-department-budget", "annualBudget", "Annual budget", "decimal")
    ]
  );

  const person = ontologyClass(
    "class-person",
    "Person",
    "Person",
    "A human member of the university community.",
    "class-university",
    2,
    [
      attribute("attr-person-name", "fullName", "Full name", "string", { required: true }),
      attribute("attr-person-email", "email", "Email", "string", { required: true }),
      attribute("attr-person-birth-date", "birthDate", "Birth date", "date"),
      attribute("attr-person-homepage", "homepage", "Homepage", "uri")
    ]
  );

  const student = ontologyClass(
    "class-student",
    "Student",
    "Student",
    "A person enrolled in at least one course.",
    "class-person",
    3,
    [
      attribute("attr-student-number", "studentNumber", "Student number", "string", {
        required: true
      }),
      attribute("attr-student-enrolment", "enrolmentDate", "Enrolment date", "date"),
      attribute("attr-student-gpa", "gpa", "Grade point average", "decimal", {
        description: "Cumulative GPA on a 0-4 scale."
      }),
      attribute("attr-student-full-time", "isFullTime", "Full time", "boolean")
    ]
  );

  const professor = ontologyClass(
    "class-professor",
    "Professor",
    "Professor",
    "A person who teaches courses and supervises research.",
    "class-person",
    4,
    [
      attribute("attr-professor-number", "employeeNumber", "Employee number", "string", {
        required: true
      }),
      attribute("attr-professor-hire-date", "hireDate", "Hire date", "date"),
      attribute("attr-professor-tenured", "isTenured", "Tenured", "boolean"),
      attribute("attr-professor-office", "officeUrl", "Office page", "uri"),
      attribute("attr-professor-interests", "researchInterests", "Research interests", "string", {
        cardinality: "many",
        description: "One tag per research area."
      })
    ]
  );

  const course = ontologyClass(
    "class-course",
    "Course",
    "Course",
    "A taught unit that students enrol in.",
    "class-university",
    5,
    [
      attribute("attr-course-title", "title", "Title", "string", { required: true }),
      attribute("attr-course-credits", "credits", "Credits", "integer", {
        required: true,
        description: "ECTS-style credit points."
      }),
      attribute("attr-course-updated", "lastUpdated", "Last updated", "dateTime"),
      attribute("attr-course-online", "isOnline", "Online", "boolean"),
      attribute("attr-course-catalogue", "catalogueUrl", "Catalogue URL", "uri"),
      attribute("attr-course-level", "level", "Level", "string", {
        enumValues: ["bachelor", "master", "doctoral"]
      })
    ]
  );

  const enrollment = ontologyClass(
    "class-enrollment",
    "Enrollment",
    "Enrollment",
    "A student's registration in one course offering.",
    "class-university",
    6,
    [
      attribute("attr-enrollment-at", "enrolledAt", "Enrolled at", "dateTime", {
        required: true
      }),
      attribute("attr-enrollment-grade", "finalGrade", "Final grade", "decimal"),
      attribute("attr-enrollment-completed", "isCompleted", "Completed", "boolean"),
      attribute("attr-enrollment-status", "status", "Status", "string", {
        enumValues: ["active", "completed", "withdrawn"]
      })
    ]
  );

  const relations: OntologyRelation[] = [
    relation(
      "rel-enrolled-in",
      "enrolledIn",
      "enrolled in",
      "A student is registered in a course.",
      "class-student",
      "class-course",
      "many-to-many"
    ),
    relation(
      "rel-teaches",
      "teaches",
      "teaches",
      "A professor teaches a course.",
      "class-professor",
      "class-course",
      "one-to-many"
    ),
    relation(
      "rel-offered-by",
      "offeredBy",
      "offered by",
      "A course is owned by a department.",
      "class-course",
      "class-department",
      "many-to-one"
    ),
    relation(
      "rel-member-of",
      "memberOf",
      "member of",
      "A person belongs to a department.",
      "class-person",
      "class-department",
      "many-to-one"
    ),
    relation(
      "rel-majors-in",
      "majorsIn",
      "majors in",
      "A student pursues a major in a department.",
      "class-student",
      "class-department",
      "many-to-one"
    )
  ];

  const base = createOntology({
    id: SAMPLE_ID,
    name: "University",
    description:
      "A small university domain with people, departments, courses and enrolments.",
    version: "0.1.0",
    baseIri: SAMPLE_BASE_IRI,
    now: SAMPLE_CREATED_AT
  });

  return autoLayout({
    ...base,
    classes: [
      university,
      department,
      person,
      student,
      professor,
      course,
      enrollment
    ],
    relations
  });
}
