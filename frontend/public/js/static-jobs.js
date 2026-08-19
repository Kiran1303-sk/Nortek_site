/* eslint-env browser */
(function () {
  const jobs = [
    {
      jobCode: 'NTC-134',
      title: 'Software Developer',
      type: 'Full Time',
      hours: '40 Hours Per Week',
      experience: '0-2',
      location: 'Irving, Texas, USA',
      postedOn: '2024-12-18',
      description:
        'Nortek Consulting Inc. has openings for Software Developers for Irving, TX and various unanticipated sites throughout the US.',
      duties: [
        'Research, design, develop, implement, test, and support applications in complex software solutions as per business requirements.',
        'Perform requirements gathering, code, debug, deploy, and resolve production issues.',
        'Use skills like Java, Python, .NET, J2EE, Spring MVC, Spring Core, Web Services, Angular, JavaScript, SQL, PLSQL, and HTML.',
        'Analyze and design databases interacting with Java software applications.'
      ],
      education: [
        "Master's or equivalent in Science, Engineering, Information Systems/Technology, Business Administration or related field.",
        'Travel and/or relocation to unanticipated client sites throughout the USA is required.'
      ]
    },
    {
      jobCode: 'NTC-133',
      title: 'Business Analyst',
      type: 'Full Time',
      hours: '40 Hours Per Week',
      experience: '0-2',
      location: 'Irving, Texas, USA',
      postedOn: '2024-11-20',
      description:
        'Nortek Consulting Inc. is looking for Business Analysts to analyze business processes, gather requirements, and improve operational efficiency.',
      duties: [
        'Collect and analyze business requirements and translate them into functional specifications.',
        'Perform process analysis and suggest improvements.',
        'Work closely with stakeholders and development teams to implement solutions.',
        'Create reports, dashboards, and document business processes.'
      ],
      education: [
        "Bachelor's degree in Business Administration, Management, or related field.",
        '1-2 years of experience in business analysis or related role.'
      ]
    },
    {
      jobCode: 'NTC-127',
      title: 'Software Engineer',
      type: 'Full Time',
      hours: '40 Hours Per Week',
      experience: '0-2',
      location: 'Irving, Texas, USA and remote locations',
      postedOn: '2024-10-15',
      description:
        'We are hiring Software Engineers to build responsive and interactive web applications using modern frameworks.',
      duties: [
        'Develop user-facing features using React, Angular, or Vue.js.',
        'Optimize applications for speed and scalability.',
        'Collaborate with backend developers and UI/UX designers.',
        'Maintain code quality and perform code reviews.'
      ],
      education: [
        "Bachelor's degree in Computer Science or related field.",
        'Experience with JavaScript, HTML, CSS, and modern frontend frameworks.'
      ]
    },
    {
      jobCode: 'NTC-126',
      title: 'RPA Solution Architect',
      type: 'Full Time',
      hours: '40 Hours Per Week',
      experience: '2-5',
      location: 'Irving, Texas, USA',
      postedOn: '2024-09-05',
      description:
        'We are seeking RPA Solution Architects to design and implement automation solutions for clients.',
      duties: [
        'Design and implement RPA solutions using tools like UiPath, Automation Anywhere, or Blue Prism.',
        'Analyze business processes to identify automation opportunities.',
        'Collaborate with business stakeholders to ensure alignment.',
        'Provide guidance and mentorship to RPA developers.'
      ],
      education: [
        "Bachelor's degree in Computer Science, Engineering, or related field.",
        '3+ years of experience in RPA development and architecture.'
      ]
    },
    {
      jobCode: 'NTC-130',
      title: 'Project Manager',
      type: 'Full Time',
      hours: '40 Hours Per Week',
      experience: '2-5',
      location: 'Remote',
      postedOn: '2024-09-03',
      description: 'Manage end-to-end software development projects.',
      duties: [
        'Plan and manage project timelines.',
        'Coordinate team activities.',
        'Track project progress.',
        'Communicate with stakeholders.'
      ],
      education: [
        "Bachelor's degree or MBA.",
        '5+ years of project management experience.'
      ]
    },
    {
      jobCode: 'NTC-132',
      title: 'QA Engineer',
      type: 'Full Time',
      hours: '40 Hours Per Week',
      experience: '2-5',
      location: 'Hyderabad, India',
      postedOn: '2024-09-01',
      description: 'Ensure software quality through testing processes.',
      duties: [
        'Create and execute test cases.',
        'Identify and report bugs.',
        'Perform regression testing.',
        'Collaborate with developers.'
      ],
      education: [
        "Bachelor's degree in Computer Science or related field.",
        '1-3 years of QA experience.'
      ]
    },
    {
      jobCode: 'NTC-131',
      title: 'DevOps Engineer',
      type: 'Full Time',
      hours: '40 Hours Per Week',
      experience: '2-5',
      location: 'Remote',
      postedOn: '2024-08-31',
      description: 'Automate deployments and manage cloud infrastructure.',
      duties: [
        'Maintain CI/CD pipelines.',
        'Manage cloud infrastructure.',
        'Monitor system performance.',
        'Improve deployment automation.'
      ],
      education: [
        "Bachelor's degree in Computer Science or related field.",
        '3+ years of DevOps experience.'
      ]
    },
    {
      jobCode: 'NTC-129',
      title: 'Data Scientist',
      type: 'Full Time',
      hours: '40 Hours Per Week',
      experience: '5+',
      location: 'Bangalore, India',
      postedOn: '2024-08-30',
      description: 'Build predictive models and advanced analytics solutions.',
      duties: [
        'Develop machine learning models.',
        'Analyze large datasets.',
        'Deploy data-driven solutions.',
        'Collaborate with engineering teams.'
      ],
      education: [
        "Master's degree in Data Science or related field.",
        '3+ years of data science experience.'
      ]
    },
    {
      jobCode: 'NTC-128',
      title: 'Data Analyst',
      type: 'Full Time',
      hours: '40 Hours Per Week',
      experience: '5+',
      location: 'Irving, Texas, USA',
      postedOn: '2024-08-29',
      description: 'Interpret complex datasets to support business decisions.',
      duties: [
        'Collect and analyze business data.',
        'Prepare reports and dashboards.',
        'Identify trends and patterns.',
        'Support data-driven strategies.'
      ],
      education: [
        "Bachelor's degree in Statistics or related field.",
        '1-2 years of data analysis experience.'
      ]
    },
    {
      jobCode: 'NTC-120',
      title: 'Frontend Developer',
      type: 'Full Time',
      hours: '40 Hours Per Week',
      experience: '2-5',
      location: 'Remote',
      postedOn: '2024-08-26',
      description: 'Build responsive and interactive user interfaces.',
      duties: [
        'Develop UI using HTML, CSS, and JavaScript.',
        'Integrate APIs with frontend components.',
        'Optimize web applications for performance.',
        'Ensure cross-browser compatibility.'
      ],
      education: [
        "Bachelor's degree in Computer Science or related field.",
        '1-3 years of frontend development experience.'
      ]
    },
    {
      jobCode: 'NTC-201',
      title: 'Java Developer',
      type: 'Full Time',
      hours: '40 Hours Per Week',
      experience: '2-5',
      location: 'Onsite',
      postedOn: '2024-08-26',
      description: 'Build and maintain enterprise Java applications.',
      duties: [
        'Develop enterprise features using Java and Spring.',
        'Integrate APIs with backend services.',
        'Optimize application performance and reliability.',
        'Work closely with UI and QA teams.'
      ],
      education: [
        "Bachelor's degree in Computer Science or related field.",
        '1-3 years of Java development experience.'
      ]
    },
    {
      jobCode: 'NTC-213',
      title: 'Python Developer',
      type: 'Full Time',
      hours: '40 Hours Per Week',
      experience: '2-5',
      location: 'Onsite',
      postedOn: '2024-08-26',
      description: 'Develop backend services and automation tools using Python.',
      duties: [
        'Develop Python services and automation scripts.',
        'Work with APIs and database integrations.',
        'Improve system performance and maintainability.',
        'Collaborate with frontend and QA teams.'
      ],
      education: [
        "Bachelor's degree in Computer Science or related field.",
        '1-3 years of Python development experience.'
      ]
    }
  ];

  window.NortekJobsData = jobs;
  window.getNortekJobByCode = function getNortekJobByCode(jobCode) {
    const normalized = String(jobCode || '').trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    return jobs.find((job) => String(job.jobCode || '').toLowerCase() === normalized) || null;
  };
})();
