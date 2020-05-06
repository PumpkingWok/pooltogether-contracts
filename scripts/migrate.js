#!/usr/bin/env node
const commander = require('commander');
const chalk = require('chalk')
const { Project } = require('@pooltogether/oz-migrate')
const { runShell } = require('./runShell')

const { buildContext } = require('oz-console')

const ProjectFile = require('@openzeppelin/cli/lib/models/files/ProjectFile').default
const NetworkFile = require('@openzeppelin/cli/lib/models/files/NetworkFile').default
const ConfigManager = require("@openzeppelin/cli/lib/models/config/ConfigManager").default

const program = new commander.Command()
program.description('Deploys the PoolTogether smart contracts')
program.option('-n --network [network]', 'configure OpenZeppelin network', 'kovan')
program.option('-a --address [address]', 'configures the address to deploy from', process.env.ADMIN_ADDRESS)
program.option('-v --verbose', 'adds verbosity', () => true)

program
  .command('start')
  .action(async () => {
    console.log(chalk.dim(`Starting deployment to ${program.network}....`))

    let context = await buildContext({ network: program.network, address: program.address })

    const project = new Project('.oz-migrate')
    const migration = await project.migrationForNetwork(context.networkConfig.network)

    runShell(`oz session --network ${program.network} --from ${program.address} --expires 3600 --timeout 600 --blockTimeout 50`)

    let flags = '-s'
    if (program.verbose) {
      flags = '-v'
    }

    await migration.migrate(10, async () => {
      runShell(`oz create CompoundInterestPoolFactory --force ${flags} --init initialize`)
    })

    await migration.migrate(20, async () => {
      runShell(`oz create PeriodicPrizePoolFactory --force ${flags} --init initialize`)
    })

    await migration.migrate(30, async () => {
      runShell(`oz create TicketFactory --force ${flags} --init initialize`)
    })

    await migration.migrate(40, async () => {
      runShell(`oz create ControlledTokenFactory --force ${flags} --init initialize`)
    })

    await migration.migrate(50, async () => {
      runShell(`oz create SingleRandomWinnerPrizeStrategyFactory --force ${flags} --init initialize`)
    })

    await migration.migrate(55, async () => {
      runShell(`oz create RNGBlockhash --force ${flags}`)
    })

    context = await buildContext({ network: program.network, address: program.address })
    const { 
      CompoundInterestPoolFactory,
      PeriodicPrizePoolFactory,
      TicketFactory,
      ControlledTokenFactory,
      SingleRandomWinnerPrizeStrategyFactory,
      RNGBlockhash
    } = context.contracts

    await migration.migrate(58, async () => {
      runShell(`oz create CompoundInterestPoolBuilder --force ${flags} --init initialize --args ${CompoundInterestPoolFactory.address}`)
    })

    context = await buildContext({ network: program.network, address: program.address })
    const {
      CompoundInterestPoolBuilder
    } = context.contracts

    await migration.migrate(60, async () => {
      runShell(`oz create PrizePoolBuilder --force ${flags} --init initialize --args ${CompoundInterestPoolBuilder.address},${PeriodicPrizePoolFactory.address},${TicketFactory.address},${ControlledTokenFactory.address},${RNGBlockhash.address}`)
    })

    context = await buildContext({ network: program.network, address: program.address })
    const {
      PrizePoolBuilder,
    } = context.contracts

    await migration.migrate(80, async () => {
      runShell(`oz create SingleRandomWinnerPrizePoolBuilder --force ${flags} --init initialize --args ${PrizePoolBuilder.address},${SingleRandomWinnerPrizeStrategyFactory.address}`)
    })

    console.log(chalk.green(`Completed deployment.`))
    process.exit(0)
  })

program.parse(process.argv)