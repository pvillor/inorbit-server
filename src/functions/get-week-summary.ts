import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { db } from '../db'
import dayjs from 'dayjs'
import { goalCompletions, goals } from '../db/schema'

interface GetWeekSummaryRequest {
  userId: string
  weekStartsAt: Date
}

export async function getWeekSummary({
  userId,
  weekStartsAt,
}: GetWeekSummaryRequest) {
  const firstDayOfWeek = weekStartsAt
  const lastDayOfWeek = dayjs(weekStartsAt).endOf('week').toDate()

  const goalsCreatedUpToWeek = db.$with('goals_created_up_to_week').as(
    db
      .select({
        id: goals.id,
        title: goals.title,
        desiredWeeklyFrequency: goals.desiredWeeklyFrequency,
        createdAt: goals.createdAt,
      })
      .from(goals)
      .where(and(lte(goals.createdAt, lastDayOfWeek), eq(goals.userId, userId)))
  )

  const goalsCompletedInWeek = db.$with('goal_completed_in_week').as(
    db
      .select({
        id: goalCompletions.id,
        title: goals.title,
        completedAt: goalCompletions.createdAt,
        completedAtDate: sql /*sql*/`
          DATE(${goalCompletions.createdAt})
        `.as('completed_at_date'),
      })
      .from(goalCompletions)
      .innerJoin(goals, eq(goals.id, goalCompletions.goalId))
      .orderBy(desc(goalCompletions.createdAt))
      .where(
        and(
          gte(goalCompletions.createdAt, firstDayOfWeek),
          lte(goalCompletions.createdAt, lastDayOfWeek),
          eq(goals.userId, userId)
        )
      )
  )

  const goalCompletionsByWeekDay = db.$with('goals_completed_by_week_day').as(
    db
      .select({
        completedAtDate: goalsCompletedInWeek.completedAtDate,
        completions: sql /*sql*/`
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'id', ${goalsCompletedInWeek.id},
                'title', ${goalsCompletedInWeek.title},
                'completedAt', ${goalsCompletedInWeek.completedAt}
              )
            )
          `.as('completions'),
      })
      .from(goalsCompletedInWeek)
      .groupBy(goalsCompletedInWeek.completedAtDate)
      .orderBy(desc(goalsCompletedInWeek.completedAtDate))
  )

  type GoalsPerDay = Record<
    string,
    {
      id: string
      title: string
      completedAt: string
    }[]
  >

  const result = await db
    .with(goalsCreatedUpToWeek, goalsCompletedInWeek, goalCompletionsByWeekDay)
    .select({
      completed:
        sql /*sql */`(SELECT COUNT(*) FROM ${goalsCompletedInWeek})`.mapWith(
          Number
        ),
      total:
        sql /*sql */`(SELECT SUM(${goalsCreatedUpToWeek.desiredWeeklyFrequency}) FROM ${goalsCreatedUpToWeek})`.mapWith(
          Number
        ),
      goalsPerDay: sql /*sql */<GoalsPerDay>`
        JSON_OBJECT_AGG(
          ${goalCompletionsByWeekDay.completedAtDate},
          ${goalCompletionsByWeekDay.completions}
        )
        `,
    })
    .from(goalCompletionsByWeekDay)

  return {
    summary: result[0],
  }
}
