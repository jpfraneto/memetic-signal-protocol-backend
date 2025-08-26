// Dependencies
import { HttpStatus } from '@nestjs/common';
import { FastifyReply } from 'fastify';

/**
 * Sends a JSON response with a status of 200 (OK) including the provided data and action.
 *
 * @param res - The Fastify response object.
 * @param data - The data to be included in the response.
 * @returns The response object with the status set to 200 and the provided data in JSON format.
 */
export const hasResponse = <T>(res: FastifyReply, data: T) =>
  res.status(HttpStatus.OK).send(data);

/**
 * Sends a JSON response with the specified status including the provided data and action.
 *
 * @param res - The Fastify response object.
 * @param status - The HTTP status code to be set in the response. Defaults to 500 (Internal Server Error).
 * @param action - A string describing the action performed.
 * @param data - The data to be included in the response.
 * @returns The response object with the specified status and the provided data and action in JSON format.
 */
export const hasError = <T>(
  res: FastifyReply,
  status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
  action: string,
  data: T,
) =>
  res.status(status).send({
    data,
    action,
  });

export { HttpStatus };
