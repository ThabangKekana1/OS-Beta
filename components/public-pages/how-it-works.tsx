import React from 'react';
import { SingleSection, DoubleSection, CarouselSection, LandingContainer } from '@/components/landing/LandingSections';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'How It Works | 1OS',
    description: 'Understand the zero capital expenditure solar model — ownership, installation, maintenance, and long-term energy savings for South African businesses.',
};

export default function HowItWorksPage() {
    return (
        <LandingContainer>
            {/* HERO - Single */}
            <SingleSection
                item={{
                    title: 'How it works.\nZero capex solar.',
                    description: 'Generocity removes the capital barrier to renewable energy. Your business gets a fully funded solar installation with immediate savings and zero risk.',
                    buttonTheme: 'lightPanelGlassWhite',
                    bgColor: '#0b0b0b',
                    textColor: '#ffffff',
                    image: '/how-it-works-hero-v2.jpg'
                }}
            />

            {/* THE MODEL - Carousel */}
            <CarouselSection
                title="The financial model."
                description="Through Generocity, systems are financed through institutional partners. You pay only for the energy produced — at a rate lower than grid."
                items={[
                    { tag: '01', title: 'Institutional financing', description: 'The solar system — panels, inverters, installation — is funded through a dedicated finance facility. No deposit, no credit applications.', cardBg: '#ffff80', image: '/institutional-financing.jpg' },
                    { tag: '02', title: 'Tariff arbitrage', description: 'Pay for solar energy at a locked-in rate below grid tariffs. Savings start from day one of operation.', cardBg: '#ffb3ff', image: '/tariff-arbitrage.png' },
                    { tag: '03', title: 'Full risk coverage', description: "Maintenance, insurance, and performance monitoring are included. If the system doesn't produce, you don't pay.", cardBg: '#80d4ff', image: '/full-risk-coverage.jpg' }
                ]}
            />

            {/* PROCESS - Carousel */}
            <CarouselSection
                title="Implementation process."
                description="From assessment to operation in three structured phases."
                items={[
                    { tag: '1', title: 'Feasibility audit', description: 'Technical assessment of roof integrity, grid connection capacity, and historical energy consumption patterns.', cardBg: '#b3ffb3', image: '/feasibility-audit.jpg' },
                    { tag: '2', title: 'System engineering', description: 'Custom design optimized for your specific load profile and seasonal consumption patterns.', cardBg: '#e6ccff', image: '/system-engineering.jpg' },
                    { tag: '3', title: 'Deployment & monitoring', description: 'Professional installation by accredited teams, followed by ongoing remote monitoring for maximum yield.', cardBg: '#ffccd5', image: '/deployment-monitoring.jpg' }
                ]}
            />

            {/* OWNERSHIP - Double */}
            <DoubleSection
                title="Ownership structure."
                items={[
                    {
                        title: 'During the agreement',
                        description: 'System is owned by the financing entity. Installed via roof-lease or Power Purchase Agreement. No obligation to purchase.',
                        image: '/during-agreement.jpg'
                    },
                    {
                        title: 'After the agreement',
                        description: 'Ownership may transfer to your business at end of term. System continues generating free energy for asset life.',
                        image: '/after-agreement.png'
                    }
                ]}
            />
        </LandingContainer>
    );
}
