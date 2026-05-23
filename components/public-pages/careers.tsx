import React from 'react';
import { SingleSection, DoubleSection, CarouselSection, LandingContainer } from '@/components/landing/LandingSections';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Careers | 1OS',
    description: "Join 1OS as an independent sales representative. Commission-based, performance-tracked, and directly contributing to South Africa's energy transition.",
};

export default function CareersPage() {
    const salesHref = '/careers/apply';

    return (
        <LandingContainer>
            {/* HERO - Single */}
            <div id="apply-now-section">
                <SingleSection
                    item={{
                        title: 'Careers.\nBuild what South Africa needs.',
                        description: 'We are building the energy company South Africa needs. Join a mission-driven team working to solve the electricity crisis with urgency, ambition, and real-world execution.',
                        link: salesHref,
                        linkText: 'Apply Now',
                        buttonTheme: 'lightPanelGlassWhite',
                        bgColor: '#0b0b0b',
                        textColor: '#ffffff',
                        image: '/careers-hero-updated.png'
                    }}
                />
            </div>

            <CarouselSection
                title="Open positions."
                description="We are currently hiring across sales, operations, growth, analysis, and design."
                items={[
                    { title: 'Sales representative', description: 'Independent, commission-based commercial lead generation across South Africa.', cardBg: '#ffd8a8', image: '/sales-rep-card.png' },
                    { title: 'Administrator', description: 'Operational support across applications, coordination, reporting, and internal systems.', cardBg: '#d0ebff', image: '/admin-card-v2.jpg' },
                    { title: 'Business development', description: 'Pipeline growth, partnership development, and strategic commercial expansion.', cardBg: '#d3f9d8', image: '/biz-dev-card.jpg' },
                    { title: 'Business analyst', description: 'Operational and commercial analysis across applications, pipeline performance, and internal reporting.', cardBg: '#e5dbff', image: '/ba-card.png' },
                    { title: 'Product designer', description: 'Design customer-facing flows, product interfaces, and internal tooling experiences across the platform.', cardBg: '#ffe3e3', image: '/product-designer-card.png' }
                ]}
            />

            {/* THE ROLE - Carousel */}
            <CarouselSection
                title="Mission roles."
                description="We are looking for people with range, conviction, and high agency to help build a better energy future for South Africa."
                items={[
                    { title: 'National impact', description: 'Work on a problem that matters. Reliable electricity is foundational to growth, dignity, and economic expansion in South Africa.', cardBg: '#ffff80', image: '/national-impact.png' },
                    { title: 'High agency', description: 'We value people who take ownership, move decisively, and solve hard problems without waiting for permission.', cardBg: '#ffb3ff', image: '/high-agency.jpg' },
                    { title: 'Real-world execution', description: 'This is not theory. You will help ship systems, improve operations, and create measurable outcomes in the field.', cardBg: '#80d4ff', image: '/real-time-data.png' }
                ]}
            />

            {/* EXPECTATIONS - Double */}
            <DoubleSection
                title="Expectations."
                items={[
                    {
                        title: 'Professional integrity',
                        description: 'You represent the 1OS brand. Accuracy and professional ethics are non-negotiable.',
                        image: '/professional-integrity-v2.jpg'
                    },
                    {
                        title: 'Data compliance',
                        description: 'Strict adherence to POPIA regulations during all data collection and lead submission.',
                        image: '/data-compliance-v2.png'
                    }
                ]}
            />

            {/* CTA - Single */}
            <div id="apply-representative-section">
                <SingleSection
                    item={{
                        title: 'Ready to join the mission?',
                        description: 'We are looking for mission-aligned operators, commercial talent, analysts, and designers to help build South Africa\u2019s energy future.',
                        link: salesHref,
                        linkText: 'Apply',
                        buttonTheme: 'lightPanelGlass',
                        bgColor: '#f1f1f1',
                        textColor: '#000000',
                        image: '/join-the-mission-v2.png'
                    }}
                />
            </div>
        </LandingContainer>
    );
}
